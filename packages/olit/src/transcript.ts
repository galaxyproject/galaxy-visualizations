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
    if (m.role === "compactionSummary") {
      // Said the way it was said live, rather than shown as something the user wrote.
      chat.addInfoMessage("Summarized the earlier conversation to make room.");
    } else if (m.role === "user") {
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
