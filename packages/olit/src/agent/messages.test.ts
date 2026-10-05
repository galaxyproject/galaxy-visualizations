import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import { toChat } from "./messages";

const TRANSCRIPT = [
  { role: "system", content: "identity", timestamp: 0 },
  { role: "user", content: "list my histories", timestamp: 0 },
  {
    role: "assistant",
    content: [
      { type: "text", text: "Looking." },
      { type: "toolCall", id: "c1", name: "get_histories", arguments: { limit: 5 } },
    ],
    timestamp: 0,
  },
  {
    role: "toolResult",
    toolCallId: "c1",
    toolName: "get_histories",
    content: [{ type: "text", text: '{"data":[]}' }],
    isError: false,
    timestamp: 0,
  },
  { role: "assistant", content: [{ type: "text", text: "You have none." }], timestamp: 0 },
] as unknown as AgentMessage[];

describe("toChat", () => {
  it("exports pi's messages in the chat shape the harness grades", () => {
    expect(toChat(TRANSCRIPT)).toEqual([
      { role: "system", content: "identity" },
      { role: "user", content: "list my histories" },
      {
        role: "assistant",
        content: "Looking.",
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "get_histories", arguments: '{"limit":5}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "c1", name: "get_histories", content: '{"data":[]}' },
      { role: "assistant", content: "You have none." },
    ]);
  });

  it("keeps the reasoning key a provider used", () => {
    const turn = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "thinking aloud", thinkingSignature: "reasoning" }],
      timestamp: 0,
    } as unknown as AgentMessage;
    expect(toChat([turn])).toEqual([
      { role: "assistant", content: null, reasoning: "thinking aloud" },
    ]);
  });

  it("flattens pi's content arrays to text", () => {
    const user = {
      role: "user",
      content: [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ],
      timestamp: 0,
    };
    expect(toChat([user as AgentMessage])).toEqual([{ role: "user", content: "a\nb" }]);
  });

  it("leaves out pi's tool declarations, which say nothing a grader reads", () => {
    const declared = {
      role: "system",
      content: "",
      toolsAdded: [{ name: "finish" }],
      timestamp: 0,
    };
    expect(toChat([...TRANSCRIPT.slice(0, 2), declared as unknown as AgentMessage])).toEqual([
      { role: "system", content: "identity" },
      { role: "user", content: "list my histories" },
    ]);
  });
});
