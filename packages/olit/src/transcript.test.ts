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
    failed: vi.fn(),
    wrote: vi.fn(),
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

  const unanswered = (reason: string, detail?: string) =>
    ({
      type: "submission",
      record: { id: 1, type: "input", status: "unanswered", reason, detail },
    }) as unknown as AgentEvent;

  it("says why a message went unanswered rather than that the model kept quiet", () => {
    const { view: v } = view();
    v.apply([
      { type: "run_start", inputs: [] } as unknown as AgentEvent,
      unanswered("faulted", "host.watched raised"),
    ]);
    expect(v.outcome.error).toBe("Olit failed while answering: host.watched raised");
    v.apply([
      { type: "run_start", inputs: [] } as unknown as AgentEvent,
      unanswered("model_error", "context overflow"),
    ]);
    expect(v.outcome.error).toBe("The model request failed: context overflow");
  });

  it("keeps a Stop and a spent turn budget as their own endings", () => {
    const { view: v } = view();
    v.apply([{ type: "run_start", inputs: [] } as unknown as AgentEvent, unanswered("aborted")]);
    expect(v.outcome).toMatchObject({ aborted: true });
    expect(v.outcome.error).toBeUndefined();
  });

  it("reports a background task that failed", () => {
    const { hooks, view: v } = view();
    v.apply([
      { type: "task_failed", taskId: 7, kind: "olit.galaxy-watch", message: "boom" } as AgentEvent,
    ]);
    expect(hooks.failed).toHaveBeenCalledWith("Olit's olit.galaxy-watch task failed: boom");
  });
});

describe("a run drawn live and the same run restored", () => {
  /** What the user ends up seeing: messages, steps and replies, in order, deltas joined. */
  function seen(chat: ReturnType<typeof view>["chat"]) {
    const calls = [
      ...Object.entries(chat).flatMap(([name, fn]) =>
        (fn as ReturnType<typeof vi.fn>).mock.calls.map((args, i) => ({
          name,
          args,
          order: (fn as ReturnType<typeof vi.fn>).mock.invocationCallOrder[i],
        })),
      ),
    ].sort((a, b) => a.order - b.order);
    const out: string[] = [];
    for (const { name, args } of calls) {
      if (name === "addUserMessage") out.push(`user: ${args[0]}`);
      else if (name === "addToolCard") out.push(`step: ${args[1]}`);
      else if (name === "updateToolCard") out.push(`step ${args[1]}: ${args[2]}`);
      else if (name === "startAssistantMessage") out.push("reply: ");
      else if (name === "appendDelta") out[out.length - 1] += args[0];
    }
    return out;
  }

  const asked = user("count the rows");
  const calling = entry("pi.assistant", {
    role: "assistant",
    content: [{ type: "toolCall", id: "c1", name: "get_tool_details", arguments: {} }],
    stopReason: "toolUse",
  });
  const stepped = result(false, "get_tool_details", "12 rows");
  const answered = entry("pi.assistant", {
    role: "assistant",
    content: [{ type: "text", text: "There are 12 rows." }],
    stopReason: "stop",
  });

  it("shows the user the same conversation either way", () => {
    const live = view();
    live.view.apply([
      { type: "run_start", inputs: [] } as unknown as AgentEvent,
      { type: "message_end", entry: asked } as AgentEvent,
      { type: "message_end", entry: calling } as AgentEvent,
      {
        type: "tool_execution_start",
        toolCallId: "c1",
        toolName: "get_tool_details",
      } as AgentEvent,
      { type: "message_end", entry: stepped } as AgentEvent,
      {
        type: "message_update",
        changes: [{ type: "text_delta", contentIndex: 0, delta: "There are " }],
      } as unknown as AgentEvent,
      {
        type: "message_update",
        changes: [{ type: "text_delta", contentIndex: 0, delta: "12 rows." }],
      } as unknown as AgentEvent,
      { type: "message_end", entry: answered } as AgentEvent,
      { type: "run_end" } as unknown as AgentEvent,
    ]);
    const restored = view();
    restored.view.apply([snapshot([asked, calling, stepped, answered])]);
    expect(seen(live.chat)).toEqual(seen(restored.chat));
    expect(seen(restored.chat)).toEqual([
      "user: count the rows",
      "step: get_tool_details",
      "step done: 12 rows",
      "reply: There are 12 rows.",
    ]);
  });

  it("gives a later response's call its own step when the server reuses the id", () => {
    const again = user("count them again");
    const live = view();
    live.view.apply([
      { type: "run_start", inputs: [] } as unknown as AgentEvent,
      { type: "message_end", entry: asked } as AgentEvent,
      { type: "message_end", entry: calling } as AgentEvent,
      { type: "message_end", entry: stepped } as AgentEvent,
      { type: "message_end", entry: answered } as AgentEvent,
      { type: "run_end" } as unknown as AgentEvent,
      { type: "run_start", inputs: [] } as unknown as AgentEvent,
      { type: "message_end", entry: again } as AgentEvent,
      { type: "message_end", entry: calling } as AgentEvent,
      {
        type: "tool_execution_start",
        toolCallId: "c1",
        toolName: "get_tool_details",
      } as AgentEvent,
    ]);
    expect(live.chat.addToolCard).toHaveBeenCalledTimes(2);
    const restored = view();
    restored.view.apply([snapshot([asked, calling, stepped, answered, again, calling, stepped])]);
    expect(restored.chat.addToolCard).toHaveBeenCalledTimes(2);
  });
});

describe("a reply streamed live ends as the stored answer reads", () => {
  const update = (...changes: unknown[]) =>
    ({ type: "message_update", usage: {}, changes }) as unknown as AgentEvent;
  const stored = (text: string) =>
    entry("pi.assistant", {
      role: "assistant",
      content: [{ type: "text", text }],
      stopReason: "stop",
    });
  const shownText = (chat: ReturnType<typeof view>["chat"]) =>
    chat.appendDelta.mock.calls.map((c) => c[0]).join("");

  it("shows the text a message starts with, in one message", () => {
    const { chat, view: v } = view();
    const partial = { role: "assistant", content: [{ type: "text", text: "The **Plotly " }] };
    v.apply([
      { type: "run_start", inputs: [] } as unknown as AgentEvent,
      { type: "message_start", message: partial } as unknown as AgentEvent,
      update({ type: "text_delta", contentIndex: 0, delta: "scatter** is saved." }),
      {
        type: "message_end",
        entry: stored("The **Plotly scatter** is saved. Done."),
      } as AgentEvent,
    ]);
    expect(shownText(chat)).toBe("The **Plotly scatter** is saved. Done.");
    expect(chat.startAssistantMessage).toHaveBeenCalledTimes(1);
  });

  it("finishes with what the stored answer holds beyond what streamed", () => {
    const { chat, view: v } = view();
    v.apply([
      { type: "run_start", inputs: [] } as unknown as AgentEvent,
      update({ type: "text_delta", contentIndex: 0, delta: "Cut " }),
      { type: "message_end", entry: stored("Cut off no longer.") } as AgentEvent,
    ]);
    expect(shownText(chat)).toBe("Cut off no longer.");
    expect(chat.startAssistantMessage).toHaveBeenCalledTimes(1);
  });
});
