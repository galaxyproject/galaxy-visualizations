import type { AgentEvent, EntryRecord } from "@earendil-works/pi-durable";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_REPLY, FOLLOW_UP_MARK } from "./agent/markers";
import { ChatView } from "./transcript";

/** A tool step whose failure is prose, not `{"ok": false}` -- the cap message, a refusal. */
const DISCARDED =
  'Tool call "get_tool_details" returned 91 KB, over the 64 KB limit for a single ' +
  "result, so it was discarded.";

function view() {
  const chat = {
    addUserMessage: vi.fn(),
    addToolCard: vi.fn(),
    updateToolCard: vi.fn(),
    startAssistantMessage: vi.fn(),
    appendDelta: vi.fn(),
    finishAssistantMessage: vi.fn(),
    hideThinking: vi.fn(),
    showThinking: vi.fn(),
    clear: vi.fn(),
  };
  const hooks = {
    info: vi.fn(),
    busy: vi.fn(),
    artifacts: vi.fn(),
    ended: vi.fn(),
    usage: vi.fn(),
    retry: vi.fn(),
    retried: vi.fn(),
  };
  return { chat, hooks, view: new ChatView(chat, hooks) };
}

let id = 0;
const entry = (kind: string, message: unknown): EntryRecord =>
  ({ id: ++id, conversationId: 1, kind, model: [message] }) as unknown as EntryRecord;

const user = (content: string) => entry("pi.user", { role: "user", content, timestamp: 0 });
const result = (isError: boolean, toolName = "get_tool_details", text = DISCARDED) =>
  entry("pi.tool-result", {
    role: "toolResult",
    toolCallId: "c1",
    toolName,
    content: [{ type: "text", text }],
    isError,
    timestamp: 0,
  });

const snapshot = (entries: EntryRecord[]): AgentEvent =>
  ({
    type: "snapshot",
    entries,
    tools: [],
    compactions: [],
    inbox: [],
    agent: {},
    usage: { models: {}, tools: {} },
  }) as unknown as AgentEvent;

describe("a restored conversation renders a step the way it ended", () => {
  it("shows a failed step as failed, from the outcome the message records", () => {
    const { chat, view: v } = view();
    v.apply([snapshot([result(true)])]);
    expect(chat.updateToolCard).toHaveBeenCalledWith("c1", "error", DISCARDED);
  });

  it("shows a step that succeeded as done, whatever its prose sounds like", () => {
    const { chat, view: v } = view();
    v.apply([snapshot([result(false)])]);
    expect(chat.updateToolCard).toHaveBeenCalledWith("c1", "done", DISCARDED);
  });

  it("says finish's summary as the closing reply", () => {
    const { chat, view: v } = view();
    v.apply([snapshot([result(false, "finish", "All done.")])]);
    expect(chat.appendDelta).toHaveBeenCalledWith("All done.");
    expect(v.outcome.done).toBe(true);
  });
});

describe("what the user sees of messages written for the model", () => {
  it("shows an automatic follow-up as a line, not as something the user wrote", () => {
    const { chat, hooks, view: v } = view();
    v.apply([snapshot([user(`${FOLLOW_UP_MARK} These runs reached a terminal state.`)])]);
    expect(chat.addUserMessage).not.toHaveBeenCalled();
    expect(hooks.info).toHaveBeenCalledWith("Checking the Galaxy results that just landed.");
  });

  it("does not show the nudge after an empty reply", () => {
    const { chat, view: v } = view();
    v.apply([snapshot([user("hi"), user(EMPTY_REPLY)])]);
    expect(chat.addUserMessage).toHaveBeenCalledTimes(1);
    expect(chat.addUserMessage).toHaveBeenCalledWith("hi");
  });
});

describe("a live run", () => {
  it("streams text and closes it once, when the answer lands", () => {
    const { chat, view: v } = view();
    const answer = entry("pi.assistant", {
      role: "assistant",
      content: [{ type: "text", text: "Hello." }],
      stopReason: "stop",
    });
    v.apply([
      { type: "run_start", inputs: [] } as unknown as AgentEvent,
      {
        type: "message_update",
        changes: [{ type: "text_delta", contentIndex: 0, delta: "Hel" }],
      } as unknown as AgentEvent,
      {
        type: "message_update",
        changes: [{ type: "text_delta", contentIndex: 0, delta: "lo." }],
      } as unknown as AgentEvent,
      { type: "message_end", entry: answer } as AgentEvent,
    ]);
    expect(chat.startAssistantMessage).toHaveBeenCalledTimes(1);
    expect(chat.appendDelta.mock.calls).toEqual([["Hel"], ["lo."]]);
    expect(chat.finishAssistantMessage).toHaveBeenCalledTimes(1);
    expect(v.outcome.spoke).toBe(true);
  });

  it("records a failed request for the line that explains the ending", () => {
    const { view: v } = view();
    const failed = entry("pi.assistant", {
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage: "429 Too Many Requests",
    });
    v.apply([
      { type: "run_start", inputs: [] } as unknown as AgentEvent,
      { type: "message_end", entry: failed } as AgentEvent,
    ]);
    expect(v.outcome).toMatchObject({ spoke: false, error: "429 Too Many Requests" });
  });
});
