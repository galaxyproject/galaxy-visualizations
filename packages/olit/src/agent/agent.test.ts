import { describe, expect, it } from "vitest";
import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createGalaxyContext } from "@galaxyproject/galaxy-ops/browser";

import { destructiveGate, type Ask } from "./destructive";
import { galaxyTools, runPythonTool } from "./tools";

const HISTORY = { id: "f2c1", name: "RNA-seq", count: 3, update_time: "2026-10-05T00:00:00" };

function galaxyServer() {
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    requests.push(`${request.method} ${url.pathname}`);
    const body = url.pathname.endsWith("/version")
      ? { version_major: "26.1", version_minor: "0" }
      : url.pathname === "/api/histories"
        ? [HISTORY]
        : HISTORY;
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  };
  const ctx = createGalaxyContext({ baseUrl: "http://galaxy.test/", apiKey: "", fetchImpl });
  return { ctx, requests };
}

function run(
  responses: ReturnType<typeof fauxAssistantMessage>[],
  {
    python = async (_code: string) => "",
    ask,
  }: { python?: (code: string) => Promise<string>; ask?: Ask } = {},
) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses(responses);
  const galaxy = galaxyServer();
  const agent = new Agent({
    initialState: {
      model: faux.getModel(),
      tools: [...galaxyTools(galaxy.ctx), runPythonTool(python)],
    },
    streamFn: models.streamSimple.bind(models),
    beforeToolCall: destructiveGate(ask),
  });
  const events: AgentEvent[] = [];
  agent.subscribe((e) => void events.push(e));
  return { agent, events, requests: galaxy.requests };
}

const call = (name: string, args: Parameters<typeof fauxToolCall>[1]) =>
  fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });

const ended = (events: AgentEvent[]) =>
  events.filter((e) => e.type === "tool_execution_end") as Extract<
    AgentEvent,
    { type: "tool_execution_end" }
  >[];

const resultText = (event: ReturnType<typeof ended>[number]) =>
  event.result.content.map((c: { text?: string }) => c.text).join("");

describe("pi agent with Olit tools", () => {
  it("runs a galaxy-ops operation and streams the reply", async () => {
    const { agent, events } = run([
      call("get_histories", {}),
      fauxAssistantMessage([fauxText("You have one history.")]),
    ]);
    await agent.prompt("Which histories do I have?");
    const [done] = ended(events);
    expect(done.isError).toBe(false);
    expect(resultText(done)).toContain("f2c1");
    expect(events.some((e) => e.type === "message_update")).toBe(true);
  });

  it("takes galaxy-mcp's snake_case arguments and hands the operation its own", async () => {
    const { agent, events, requests } = run([
      call("get_history_details", { history_id: "f2c1" }),
      fauxAssistantMessage([fauxText("Done.")]),
    ]);
    await agent.prompt("Describe it.");
    expect(ended(events)[0].isError).toBe(false);
    expect(requests).toContain("GET /api/histories/f2c1");
  });

  it("returns run_python output and reports a failure as an error result", async () => {
    const python = async (code: string) => {
      if (code.includes("raise")) throw new Error("ValueError: no");
      return "3";
    };
    const { agent, events } = run(
      [
        call("run_python", { code: "1 + 2" }),
        call("run_python", { code: "raise ValueError('no')" }),
        fauxAssistantMessage([fauxText("Done.")]),
      ],
      { python },
    );
    await agent.prompt("Compute.");
    const [ok, failed] = ended(events);
    expect(ok.result.content).toEqual([{ type: "text", text: "3" }]);
    expect(failed.isError).toBe(true);
  });

  it("leaves the operations Olit runs itself to Olit", () => {
    const names = galaxyTools(galaxyServer().ctx).map((t) => t.name);
    expect(names).toContain("update_history");
    expect(names).not.toContain("run_tool");
    expect(names).not.toContain("get_history_contents");
  });
});

describe("destructive gate", () => {
  const deleting = () => [
    call("update_history", { history_id: "f2c1", deleted: true }),
    fauxAssistantMessage([fauxText("Done.")]),
  ];
  const updates = (requests: string[]) => requests.filter((r) => r.startsWith("PUT"));

  it("refuses when nobody can answer", async () => {
    const { agent, events, requests } = run(deleting());
    await agent.prompt("Delete it.");
    expect(resultText(ended(events)[0])).toContain("no interactive session");
    expect(updates(requests)).toEqual([]);
  });

  it("refuses when the user declines", async () => {
    const { agent, events, requests } = run(deleting(), { ask: async () => false });
    await agent.prompt("Delete it.");
    expect(resultText(ended(events)[0])).toContain("The user declined");
    expect(updates(requests)).toEqual([]);
  });

  it("runs once the user approves, and asks again next time", async () => {
    const asked: string[] = [];
    const ask: Ask = async (_title, message) => {
      asked.push(message);
      return true;
    };
    const { agent, events, requests } = run(
      [
        call("update_history", { history_id: "f2c1", deleted: true }),
        call("update_history", { history_id: "f2c1", deleted: true }),
        fauxAssistantMessage([fauxText("Done.")]),
      ],
      { ask },
    );
    await agent.prompt("Delete it.");
    expect(ended(events).every((e) => !e.isError)).toBe(true);
    expect(asked).toHaveLength(2);
    expect(asked[0]).toContain("Mark the entire history (f2c1) as deleted");
    expect(updates(requests)).toEqual(["PUT /api/histories/f2c1", "PUT /api/histories/f2c1"]);
  });

  it("lets a non-destructive update through without asking", async () => {
    const { agent, events } = run(
      [
        call("update_history", { history_id: "f2c1", name: "renamed" }),
        fauxAssistantMessage([fauxText("Done.")]),
      ],
      { ask: async () => false },
    );
    await agent.prompt("Rename it.");
    expect(ended(events)[0].isError).toBe(false);
  });
});
