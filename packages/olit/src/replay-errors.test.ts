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

describe("a restored session renders a failed step as failed", () => {
  const stored = [
    { role: "tool", tool_call_id: "c1", name: "get_tool_details", content: DISCARDED },
  ];

  it("uses the recorded outcome", () => {
    const chat = panel();
    replayMessages(chat as never, stored as never, new Set(["c1"]));
    expect(chat.updateToolCard).toHaveBeenCalledWith("c1", "error", DISCARDED);
  });

  it("without it the same step reads as success, which is the bug", () => {
    const chat = panel();
    replayMessages(chat as never, stored as never);
    expect(chat.updateToolCard).toHaveBeenCalledWith("c1", "done", DISCARDED);
  });
});
