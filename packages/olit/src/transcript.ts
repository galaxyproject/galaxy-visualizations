/** Turning the agent's messages and errors into what the chat panel shows. */
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { contentText } from "@earendil-works/pi-ai";

import { ChatPanel } from "./orbit/chat/chat-panel";

const textOf = (content: unknown) => contentText(content as Parameters<typeof contentText>[0]);

/** Render the turn's messages; returns whether any assistant prose was shown. */
export function renderMessages(
  chat: ChatPanel,
  messages: AgentMessage[],
  streamed: Set<string> = new Set(),
  textStreamed = false,
): boolean {
  let spoke = false;
  for (const m of messages) {
    if (m.role === "toolResult") {
      const text = textOf(m.content);
      // `finish` puts the model's closing words in a tool argument, not in content.
      if (m.toolName === "finish" && !m.isError && text) {
        spoke = true;
        say(chat, text);
      } else if (!streamed.has(m.toolCallId)) {
        chat.updateToolCard(m.toolCallId, m.isError ? "error" : "done", text);
      }
    } else if (m.role === "assistant") {
      const text = m.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { text: string }).text)
        .join("");
      if (text) {
        spoke = true;
        if (!textStreamed) {
          say(chat, text);
        }
      }
      for (const c of m.content) {
        if (c.type === "toolCall" && !streamed.has(c.id)) {
          chat.addToolCard(c.id, c.name || "tool");
        }
      }
    }
  }
  return spoke;
}

/** Repaint a stored transcript into the panel; loom: session-replay.js on `--continue`. */
export function replayMessages(chat: ChatPanel, messages: AgentMessage[]) {
  for (const m of messages) {
    if (m.role === "user") {
      chat.addUserMessage(textOf(m.content));
    } else if (m.role !== "system") {
      renderMessages(chat, [m]);
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
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
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
