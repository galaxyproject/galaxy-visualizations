import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, JsonObject, ThinkingContent } from "@earendil-works/pi-ai";

/** A message in the OpenAI chat format, which sessions store and evaluations read. */
export interface Message {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
  reasoning?: string;
}

const REASONING_KEYS = ["reasoning_content", "reasoning"] as const;

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function parsed(text: string): JsonObject {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map((c: { type: string; text?: string }) => (c.type === "text" ? c.text : ""))
          .join("")
      : "";

export function toPi(messages: Message[]): AgentMessage[] {
  const timestamp = Date.now();
  return messages.map((m): AgentMessage => {
    if (m.role === "assistant") {
      const key = REASONING_KEYS.find((k) => m[k]);
      const content: AssistantMessage["content"] = [];
      if (key) {
        content.push({ type: "thinking", thinking: m[key]!, thinkingSignature: key });
      }
      if (m.content) {
        content.push({ type: "text", text: m.content });
      }
      for (const call of m.tool_calls ?? []) {
        content.push({
          type: "toolCall",
          id: call.id,
          name: call.function.name,
          arguments: parsed(call.function.arguments),
        });
      }
      return {
        role: "assistant",
        content,
        api: "openai-completions",
        provider: "olit",
        model: "",
        usage: EMPTY_USAGE,
        stopReason: m.tool_calls?.length ? "toolUse" : "stop",
        timestamp,
      } as AssistantMessage;
    }
    if (m.role === "tool") {
      return {
        role: "toolResult",
        toolCallId: m.tool_call_id ?? "",
        toolName: m.name ?? "",
        content: [{ type: "text", text: m.content ?? "" }],
        isError: false,
        timestamp,
      };
    }
    if (m.role === "system") {
      return { role: "system", content: m.content ?? "", timestamp } as AgentMessage;
    }
    return { role: "user", content: m.content ?? "", timestamp };
  });
}

export function fromPi(messages: AgentMessage[]): Message[] {
  return messages.flatMap((m): Message[] => {
    if (m.role === "assistant") {
      const out: Message = { role: "assistant", content: textOf(m.content) || null };
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
        { role: "tool", tool_call_id: m.toolCallId, name: m.toolName, content: textOf(m.content) },
      ];
    }
    if (m.role === "system" && !textOf(m.content)) {
      // pi's declaration of the tool set, which it re-derives every turn; Olit keeps no copy.
      return [];
    }
    if (m.role === "system" || m.role === "user") {
      return [{ role: m.role, content: textOf(m.content) }];
    }
    return [];
  });
}
