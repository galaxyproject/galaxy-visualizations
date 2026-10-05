import { estimateContextTokens, estimateMessageTokens } from "@earendil-works/pi-ai/utils/estimate";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { toChat, type ChatMessage } from "./messages";

export const RESERVE_TOKENS = 16384;
export const KEEP_RECENT_TOKENS = 20000;
export const TOOL_RESULT_MAX_CHARS = 2000;

const SUMMARY_PREFIX =
  "The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
const SUMMARY_SUFFIX = "\n</summary>";

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
  return estimateContextTokens(messages as never).tokens;
}

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
    const tokens = estimateMessageTokens(messages[i] as never);
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

function previousSummary(messages: ChatMessage[]): string | undefined {
  const found = messages.find(
    (m) => m.role === "user" && (m.content ?? "").startsWith(SUMMARY_PREFIX),
  );
  if (!found) {
    return undefined;
  }
  const body = found.content!.slice(SUMMARY_PREFIX.length);
  return body.endsWith(SUMMARY_SUFFIX) ? body.slice(0, -SUMMARY_SUFFIX.length) : body;
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
    const leading = current[0]?.role === "system" ? 1 : 0;
    const rest = current.slice(leading);
    const cut = findCutIndex(rest, settings.keepRecentTokens);
    if (!cut) {
      return { messages: current, status: "impossible" };
    }
    const older = toChat(rest.slice(0, cut).filter((m) => m.role !== "system"));
    const summary = await summarize(
      SUMMARIZATION_SYSTEM_PROMPT,
      buildPrompt(older, previousSummary(older)),
      signal,
    );
    if (!summary.trim()) {
      return { messages: current, status: "impossible" };
    }
    kept = {
      first: rest[cut],
      summary: {
        role: "user",
        content: SUMMARY_PREFIX + summary + SUMMARY_SUFFIX,
        timestamp: Date.now(),
      },
    };
    return { messages: reduce(messages), status: "compacted" };
  }

  return { compact, reduce };
}
