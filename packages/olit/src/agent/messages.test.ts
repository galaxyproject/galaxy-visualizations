import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import { fromPi, toPi, type Message } from "./messages";

const TRANSCRIPT: Message[] = [
  { role: "system", content: "identity" },
  { role: "user", content: "list my histories" },
  {
    role: "assistant",
    content: "Looking.",
    reasoning_content: "The user wants histories.",
    tool_calls: [
      { id: "c1", type: "function", function: { name: "get_histories", arguments: '{"limit":5}' } },
      { id: "c2", type: "function", function: { name: "get_user", arguments: "{}" } },
    ],
  },
  { role: "tool", tool_call_id: "c1", name: "get_histories", content: '{"data":[]}' },
  { role: "tool", tool_call_id: "c2", name: "get_user", content: '{"data":{}}' },
  { role: "assistant", content: "You have none." },
];

describe("messages", () => {
  it("round-trips a transcript", () => {
    expect(fromPi(toPi(TRANSCRIPT))).toEqual(TRANSCRIPT);
  });

  it("maps an assistant turn onto pi's content blocks", () => {
    const [, , turn, result] = toPi(TRANSCRIPT);
    expect(turn.role).toBe("assistant");
    const content = (turn as Extract<AgentMessage, { role: "assistant" }>).content;
    expect(content.map((c) => c.type)).toEqual(["thinking", "text", "toolCall", "toolCall"]);
    expect(content[2]).toMatchObject({ id: "c1", name: "get_histories", arguments: { limit: 5 } });
    expect((turn as { stopReason: string }).stopReason).toBe("toolUse");
    expect(result).toMatchObject({
      role: "toolResult",
      toolCallId: "c1",
      toolName: "get_histories",
      isError: false,
    });
  });

  it("keeps the reasoning key a provider used", () => {
    const message: Message = { role: "assistant", content: null, reasoning: "thinking aloud" };
    expect(fromPi(toPi([message]))).toEqual([message]);
  });

  it("writes an assistant turn without text as null content", () => {
    const message: Message = {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c1", type: "function", function: { name: "get_user", arguments: "{}" } }],
    };
    expect(fromPi(toPi([message]))).toEqual([message]);
  });

  it("reads unparsable arguments as an empty object", () => {
    const [turn] = toPi([
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "c1", function: { name: "run_tool", arguments: "{broken" } }],
      },
    ]);
    expect((turn as Extract<AgentMessage, { role: "assistant" }>).content[0]).toMatchObject({
      arguments: {},
    });
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
    expect(fromPi([user as AgentMessage])).toEqual([{ role: "user", content: "ab" }]);
  });

});
