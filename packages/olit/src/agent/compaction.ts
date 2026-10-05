import { estimateContextTokens, estimateMessageTokens } from "@earendil-works/pi-ai/utils/estimate";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { isCompactionSummary, toChat, toLlm, type ChatMessage } from "./messages";

export const RESERVE_TOKENS = 16384;
export const KEEP_RECENT_TOKENS = 20000;
export const TOOL_RESULT_MAX_CHARS = 2000;

const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

const SUMMARIZATION_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const UPDATE_SUMMARIZATION_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

export interface CompactionSettings {
  enabled: boolean;
  contextWindow: number;
  reserveTokens: number;
  keepRecentTokens: number;
}

export function compactionSettings(options: {
  enabled?: boolean;
  contextWindow: number;
  reserveTokens?: number;
  keepRecentTokens?: number;
}): CompactionSettings {
  const reserveTokens = options.reserveTokens || RESERVE_TOKENS;
  const budget = Math.max(0, options.contextWindow - reserveTokens);
  return {
    enabled: options.enabled !== false,
    contextWindow: options.contextWindow,
    reserveTokens,
    keepRecentTokens: Math.min(options.keepRecentTokens || KEEP_RECENT_TOKENS, budget),
  };
}

/** Tokens the next request carries: pi's count, from the last reported usage plus what followed. */
export function contextTokens(messages: AgentMessage[]): number {
  return estimateContextTokens(toLlm(messages) as never).tokens;
}

/** pi's estimate of one message, as the model will read it. */
const messageTokens = (m: AgentMessage) =>
  toLlm([m]).reduce((sum, llm) => sum + estimateMessageTokens(llm as never), 0);

const validCut = (m: AgentMessage) => m.role === "user" || m.role === "assistant";

export function findCutIndex(
  messages: AgentMessage[],
  keepRecentTokens: number,
): number | undefined {
  const valid = messages.flatMap((m, i) => (validCut(m) ? [i] : []));
  if (!valid.length) {
    return undefined;
  }
  let accumulated = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = messageTokens(messages[i]);
    if (!tokens) {
      continue;
    }
    accumulated += tokens;
    if (accumulated >= keepRecentTokens) {
      return valid.find((c) => c >= i) ?? valid[0];
    }
  }
  return valid[0];
}

const truncate = (text: string, max: number) =>
  text.length <= max
    ? text
    : `${text.slice(0, max)}\n\n[... ${text.length - max} more characters truncated]`;

export function serialize(messages: ChatMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    const content = m.content ?? "";
    if (m.role === "user" && content) {
      parts.push(`[User]: ${content}`);
    } else if (m.role === "assistant") {
      if (content) {
        parts.push(`[Assistant]: ${content}`);
      }
      const calls = (m.tool_calls ?? []).map((c) => `${c.function.name}(${c.function.arguments})`);
      if (calls.length) {
        parts.push(`[Assistant tool calls]: ${calls.join("; ")}`);
      }
    } else if (m.role === "tool" && content) {
      parts.push(`[Tool result]: ${truncate(content, TOOL_RESULT_MAX_CHARS)}`);
    }
  }
  return parts.join("\n\n");
}

function buildPrompt(older: ChatMessage[], prior?: string): string {
  let text = `<conversation>\n${serialize(older)}\n</conversation>\n\n`;
  if (prior) {
    text += `<previous-summary>\n${prior}\n</previous-summary>\n\n`;
  }
  return text + (prior ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT);
}

export type Summarize = (system: string, prompt: string, signal?: AbortSignal) => Promise<string>;

export type CompactionStatus = "not_needed" | "compacted" | "impossible";

/** Replaces the oldest conversation with a summary, reusing it until the window fills again. */
export function compactor(settings: CompactionSettings, summarize: Summarize) {
  let kept: { first: AgentMessage; summary: AgentMessage } | undefined;

  /**
   * The summary in place of what it covers. System messages stay: besides the prompt they carry
   * pi's record of which tools exist, and a transcript without it offers the model none.
   */
  function reduce(messages: AgentMessage[]): AgentMessage[] {
    const index = kept ? messages.indexOf(kept.first) : -1;
    if (index < 0) {
      return messages;
    }
    const held = messages.slice(0, index).filter((m) => m.role === "system");
    return [...held, kept!.summary, ...messages.slice(index)];
  }

  async function compact(
    messages: AgentMessage[],
    signal?: AbortSignal,
  ): Promise<{ messages: AgentMessage[]; status: CompactionStatus }> {
    const current = reduce(messages);
    if (
      !settings.enabled ||
      contextTokens(current) <= settings.contextWindow - settings.reserveTokens
    ) {
      return { messages: current, status: "not_needed" };
    }
    // The prompt and the tool declarations are never summarized; when they alone overflow,
    // summarizing the conversation would only lose it.
    const fixed = current
      .filter((m) => m.role === "system")
      .reduce((sum, m) => sum + messageTokens(m), 0);
    if (fixed >= settings.contextWindow - settings.reserveTokens) {
      return { messages: current, status: "impossible" };
    }
    const leading = current[0]?.role === "system" ? 1 : 0;
    const rest = current.slice(leading);
    const cut = findCutIndex(rest, settings.keepRecentTokens);
    if (!cut) {
      return { messages: current, status: "impossible" };
    }
    const covered = rest.slice(0, cut);
    // A summary an earlier turn left is updated, not summarized again as conversation.
    const prior = covered.find(isCompactionSummary)?.summary;
    const older = toChat(covered.filter((m) => m.role !== "system" && !isCompactionSummary(m)));
    const summary = await summarize(SUMMARIZATION_SYSTEM_PROMPT, buildPrompt(older, prior), signal);
    if (!summary.trim()) {
      return { messages: current, status: "impossible" };
    }
    kept = {
      first: rest[cut],
      summary: { role: "compactionSummary", summary, timestamp: Date.now() },
    };
    return { messages: reduce(messages), status: "compacted" };
  }

  return { compact, reduce };
}
