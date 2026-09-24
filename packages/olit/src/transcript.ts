/** Turning the brain's messages and errors into what the chat panel shows. */
import { ChatPanel } from "./orbit/chat/chat-panel";
import type { Message } from "./pyodide-runner";

/** Render the turn's messages; returns whether any assistant prose was shown. */
export function renderMessages(
    chat: ChatPanel,
    messages: Message[],
    streamed: Set<string> = new Set(),
    failed: Set<string> = new Set(),
): boolean {
    let spoke = false;
    for (const m of messages) {
        // `finish` puts the model's closing words in a tool argument, not in content.
        if (m.role === "tool" && m.name === "finish" && m.content) {
            spoke = true;
            say(chat, m.content);
            continue;
        }
        if (m.role === "assistant") {
            if (m.content) {
                spoke = true;
                say(chat, m.content);
            }
            for (const tc of m.tool_calls || []) {
                if (!streamed.has(tc.id)) {
                    chat.addToolCard(tc.id, tc.function?.name || "tool");
                }
            }
        } else if (m.role === "tool" && m.tool_call_id) {
            if (!streamed.has(m.tool_call_id)) {
                // The recorded outcome, not a guess from the text.
                const status = failed.has(m.tool_call_id) ? "error" : toolStatus(m.content || "");
                chat.updateToolCard(m.tool_call_id, status, m.content || "");
            }
        }
    }
    return spoke;
}

/** Repaint a stored transcript into the panel; loom: session-replay.js on `--continue`. */
export function replayMessages(chat: ChatPanel, messages: Message[], failed: Set<string> = new Set()) {
    for (const m of messages) {
        if (m.role === "user") {
            chat.addUserMessage(m.content || "");
        } else if (m.role !== "system") {
            renderMessages(chat, [m], new Set(), failed);
        }
    }
}

function say(chat: ChatPanel, text: string) {
    chat.startAssistantMessage();
    chat.appendDelta(text);
    chat.finishAssistantMessage();
}

/** The last meaningful line of a Python traceback, which is the actual error. */
export function lastLine(text: string): string {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines[lines.length - 1] || text;
}

/** A provider failure in words, not a status code and a wall of JSON. */
export function describeError(err: { message?: string; status_code?: number }): string {
    const status = err.status_code;
    if (status === 429) {
        return "The model provider is out of quota for now. Wait, or switch provider with the Model button.";
    }
    if (status === 401 || status === 403) {
        return "The model provider rejected the API key. Enter another with the Model button.";
    }
    return lastLine(err.message || "The turn failed.");
}

export function toolStatus(content: string): "done" | "error" {
    try {
        const parsed = JSON.parse(content);
        if (parsed && parsed.ok === false) {
            return "error";
        }
    } catch {
        // non-JSON tool output (e.g. run_python) is a success
    }
    return "done";
}
