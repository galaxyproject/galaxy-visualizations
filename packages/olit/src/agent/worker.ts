import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import { createGalaxyContext } from "@galaxyproject/galaxy-ops/browser";

import { connect, type Endpoint } from "./model";
import { localPython } from "./python";
import { galaxyTools, runPythonTool } from "./tools";

export interface StartRequest {
  endpoint: Endpoint;
  galaxy: { root: string; credentials?: RequestCredentials };
  pyodideURL: string;
  systemPrompt: string;
}

export type WorkerEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string }
  | { type: "tool_end"; id: string; name: string; content: string; isError: boolean }
  | { type: "settled"; error?: string };

let agent: Agent | undefined;

/** Galaxy as the signed-in user: the session cookie, never an API key. */
const galaxyFetch =
  (credentials: RequestCredentials = "include"): typeof fetch =>
  (input, init) => {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    headers.delete("x-api-key");
    return fetch(new Request(request, { headers, credentials }));
  };

const post = (event: WorkerEvent) => self.postMessage(event);

function forward(event: AgentEvent) {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    post({ type: "text", delta: event.assistantMessageEvent.delta });
  } else if (event.type === "tool_execution_start") {
    post({ type: "tool_start", id: event.toolCallId, name: event.toolName });
  } else if (event.type === "tool_execution_end") {
    const content = event.result.content.map((c: { text?: string }) => c.text ?? "").join("\n");
    post({
      type: "tool_end",
      id: event.toolCallId,
      name: event.toolName,
      content,
      isError: event.isError,
    });
  }
}

function start({ endpoint, galaxy, pyodideURL, systemPrompt }: StartRequest) {
  const { model, streamFn } = connect(endpoint);
  const ctx = createGalaxyContext({
    baseUrl: galaxy.root,
    apiKey: "",
    fetchImpl: galaxyFetch(galaxy.credentials),
  });
  agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools: [...galaxyTools(ctx), runPythonTool(localPython(pyodideURL))],
    },
    streamFn,
  });
  agent.subscribe(forward);
}

async function prompt(text: string) {
  try {
    await agent!.prompt(text);
    const last = agent!.state.messages.at(-1);
    const error =
      last?.role === "assistant" && last.stopReason === "error" ? last.errorMessage : undefined;
    post({ type: "settled", error });
  } catch (err) {
    post({ type: "settled", error: String(err) });
  }
}

self.onmessage = ({ data }) => {
  if (data.type === "start") {
    start(data.request);
  } else if (data.type === "prompt") {
    void prompt(data.text);
  } else if (data.type === "abort") {
    agent?.abort();
  }
};
