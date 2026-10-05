import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { contentText, type Message, type ThinkingContent } from "@earendil-works/pi-ai";

/**
 * The summary standing in for the conversation before it: a message of its own, as pi's coding
 * agent keeps one, so nothing has to recognise it by its wording.
 */
export interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  timestamp: number;
}

declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    compactionSummary: CompactionSummaryMessage;
  }
}

export const isCompactionSummary = (m: AgentMessage): m is CompactionSummaryMessage =>
  m.role === "compactionSummary";

const SUMMARY_PREFIX =
  "The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
const SUMMARY_SUFFIX = "\n</summary>";
const LLM_ROLES = new Set(["system", "user", "assistant", "toolResult"]);

/** What the model reads: pi's own messages, and a summary as the user turn that carries it. */
export function toLlm(messages: AgentMessage[]): Message[] {
  return messages.flatMap((m): Message[] => {
    if (isCompactionSummary(m)) {
      const content = SUMMARY_PREFIX + m.summary + SUMMARY_SUFFIX;
      return [{ role: "user", content, timestamp: m.timestamp }];
    }
    return LLM_ROLES.has(m.role) ? [m as Message] : [];
  });
}

/** A message in the OpenAI chat format. Olit keeps pi's own messages; the harness grades this. */
export interface ChatMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
  reasoning?: string;
}

const REASONING_KEYS = ["reasoning_content", "reasoning"] as const;

/** pi's messages in the OpenAI chat shape the evaluation harness grades. */
export function toChat(messages: AgentMessage[]): ChatMessage[] {
  return toLlm(messages).flatMap((m): ChatMessage[] => {
    if (m.role === "assistant") {
      const out: ChatMessage = { role: "assistant", content: contentText(m.content) || null };
      const calls = m.content.filter((c) => c.type === "toolCall");
      if (calls.length) {
        out.tool_calls = calls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        }));
      }
      const thinking = m.content.filter(
        (c): c is ThinkingContent => c.type === "thinking" && !!c.thinking,
      );
      if (thinking.length) {
        const key =
          REASONING_KEYS.find((k) => k === thinking[0].thinkingSignature) ?? REASONING_KEYS[0];
        out[key] = thinking.map((c) => c.thinking).join("\n");
      }
      return [out];
    }
    if (m.role === "toolResult") {
      return [
        {
          role: "tool",
          tool_call_id: m.toolCallId,
          name: m.toolName,
          content: contentText(m.content),
        },
      ];
    }
    if (m.role === "system" && !contentText(m.content)) {
      // pi's declaration of the tool set, which it re-derives every turn; Olit keeps no copy.
      return [];
    }
    if (m.role === "system" || m.role === "user") {
      return [{ role: m.role, content: contentText(m.content) }];
    }
    return [];
  });
}
