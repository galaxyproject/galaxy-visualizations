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

import { galaxyTools, runPythonTool } from "./tools";

const galaxy: typeof fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const body = url.pathname.endsWith("/version")
    ? { version_major: "26.1", version_minor: "0" }
    : [{ id: "f2c1", name: "RNA-seq", count: 3, update_time: "2026-10-05T00:00:00" }];
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
};

function run(
  responses: ReturnType<typeof fauxAssistantMessage>[],
  python = async (_code: string) => "",
) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses(responses);
  const ctx = createGalaxyContext({
    baseUrl: "http://galaxy.test/",
    apiKey: "",
    fetchImpl: galaxy,
  });
  const agent = new Agent({
    initialState: { model: faux.getModel(), tools: [...galaxyTools(ctx), runPythonTool(python)] },
    streamFn: models.streamSimple.bind(models),
  });
  const events: AgentEvent[] = [];
  agent.subscribe((e) => void events.push(e));
  return { agent, events };
}

const ended = (events: AgentEvent[]) =>
  events.filter((e) => e.type === "tool_execution_end") as Extract<
    AgentEvent,
    { type: "tool_execution_end" }
  >[];

describe("pi agent with Olit tools", () => {
  it("runs a galaxy-ops operation and streams the reply", async () => {
    const { agent, events } = run([
      fauxAssistantMessage([fauxToolCall("get_histories", {})], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("You have one history.")]),
    ]);
    await agent.prompt("Which histories do I have?");
    const [call] = ended(events);
    expect(call.isError).toBe(false);
    expect(JSON.stringify(call.result.content)).toContain("f2c1");
    expect(events.some((e) => e.type === "message_update")).toBe(true);
  });

  it("returns run_python output and reports a failure as an error result", async () => {
    const python = async (code: string) => {
      if (code.includes("raise")) throw new Error("ValueError: no");
      return "3";
    };
    const { agent, events } = run(
      [
        fauxAssistantMessage([fauxToolCall("run_python", { code: "1 + 2" })], {
          stopReason: "toolUse",
        }),
        fauxAssistantMessage([fauxToolCall("run_python", { code: "raise ValueError('no')" })], {
          stopReason: "toolUse",
        }),
        fauxAssistantMessage([fauxText("Done.")]),
      ],
      python,
    );
    await agent.prompt("Compute.");
    const [ok, failed] = ended(events);
    expect(ok.result.content).toEqual([{ type: "text", text: "3" }]);
    expect(failed.isError).toBe(true);
  });

  it("offers no tool that writes to Galaxy", () => {
    const ctx = createGalaxyContext({
      baseUrl: "http://galaxy.test/",
      apiKey: "",
      fetchImpl: galaxy,
    });
    const names = galaxyTools(ctx).map((t) => t.name);
    expect(names).toContain("get_histories");
    expect(names).not.toContain("run_tool");
    expect(names).not.toContain("update_history");
  });
});
