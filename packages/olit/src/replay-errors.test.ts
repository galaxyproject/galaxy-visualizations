import { describe, expect, it, vi } from "vitest";

import { replayMessages } from "./transcript";

/** A tool step whose failure is prose, not `{"ok": false}` -- the cap message, a refusal. */
const DISCARDED =
  'Tool call "get_tool_details" returned 91 KB, over the 64 KB limit for a single ' +
  "result, so it was discarded.";

function panel() {
  return {
    addUserMessage: vi.fn(),
    addToolCard: vi.fn(),
    updateToolCard: vi.fn(),
    startAssistantMessage: vi.fn(),
    appendDelta: vi.fn(),
    finishAssistantMessage: vi.fn(),
  };
}

const result = (isError: boolean) => ({
  role: "toolResult",
  toolCallId: "c1",
  toolName: "get_tool_details",
  content: [{ type: "text", text: DISCARDED }],
  isError,
  timestamp: 0,
});

describe("a restored session renders a step the way it ended", () => {
  it("shows a failed step as failed, from the outcome the message records", () => {
    const chat = panel();
    replayMessages(chat as never, [result(true)] as never);
    expect(chat.updateToolCard).toHaveBeenCalledWith("c1", "error", DISCARDED);
  });

  it("shows a step that succeeded as done, whatever its prose sounds like", () => {
    const chat = panel();
    replayMessages(chat as never, [result(false)] as never);
    expect(chat.updateToolCard).toHaveBeenCalledWith("c1", "done", DISCARDED);
  });
});
