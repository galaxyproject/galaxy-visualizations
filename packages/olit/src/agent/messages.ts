import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { contentText, type ThinkingContent } from "@earendil-works/pi-ai";

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
  return messages.flatMap((m): ChatMessage[] => {
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
