import "../orbit/styles.css";
import "../olit.css";
import { parseXML } from "galaxy-charts-xml-parser";

import { createConfirm } from "../confirm-modal";
import { mountLayout } from "../layout";
import { ChatPanel } from "../orbit/chat/chat-panel";
import { applyOrbitTheme } from "../orbit/theme";
import { AgentClient } from "./client";
import type { WorkerEvent } from "./worker";

async function main() {
  const container = document.getElementById("app")!;
  applyOrbitTheme("light", document.documentElement);
  const el = mountLayout(container);
  const chat = new ChatPanel(el.messages);
  const plugin = await parseXML("olit.xml");

  const agent = new AgentClient({
    endpoint: {
      baseUrl: new URL(process.env.llm_base_url || "/llm", location.origin).href,
      model: process.env.llm_model || plugin.specs?.ai_model || "default",
    },
    galaxy: {
      root: `${location.origin}/`,
      credentials: process.env.credentials as RequestCredentials,
    },
    pyodideURL: `${location.origin}/static/pyodide`,
    systemPrompt: plugin.specs?.ai_prompt || "",
    interactive: true,
  });
  const confirm = createConfirm({
    container,
    respond: (id, approved) => agent.confirm(Number(id), approved),
    note: (text) => chat.addInfoMessage(text),
  });

  let speaking = false;
  const onEvent = (event: WorkerEvent) => {
    if (event.type === "text") {
      if (!speaking) {
        chat.hideThinking();
        chat.startAssistantMessage();
        speaking = true;
      }
      chat.appendDelta(event.delta);
      return;
    }
    if (speaking) {
      chat.finishAssistantMessage();
      speaking = false;
    }
    if (event.type === "confirm") {
      confirm(String(event.id), event);
    } else if (event.type === "tool_start") {
      chat.hideThinking();
      chat.addToolCard(event.id, event.name);
    } else if (event.type === "tool_end") {
      chat.updateToolCard(event.id, event.isError ? "error" : "done", event.content);
      chat.showThinking();
    }
  };

  async function submit() {
    const text = el.input.value.trim();
    if (!text) {
      return;
    }
    el.input.value = "";
    el.send.classList.add("hidden");
    el.abort.classList.remove("hidden");
    chat.addUserMessage(text);
    chat.showThinking();
    const error = await agent.prompt(text, onEvent);
    chat.hideThinking();
    if (error) {
      chat.addErrorMessage(error);
    }
    el.abort.classList.add("hidden");
    el.send.classList.remove("hidden");
  }

  el.send.addEventListener("click", () => void submit());
  el.abort.addEventListener("click", () => agent.abort());
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  });
}

void main();
