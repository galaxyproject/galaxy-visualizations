import { afterEach, describe, expect, it, vi } from "vitest";

import type { Message } from "./messages";
import {
  injectContext,
  injectRecord,
  Session,
  type LoopEvent,
  type SessionConfig,
} from "./session";
import type { Python } from "./tool";

type Reply = { text?: string; calls?: Array<{ name: string; args: Record<string, unknown> }> };

const ROOT = "http://galaxy.test/";
const LLM = "http://llm.test/v1";

function sse(reply: Reply): Response {
  const chunks: unknown[] = [];
  if (reply.text) {
    for (const part of reply.text.match(/.{1,4}/gs) ?? []) {
      chunks.push({ choices: [{ index: 0, delta: { content: part } }] });
    }
  }
  (reply.calls ?? []).forEach((call, index) =>
    chunks.push({
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index,
                id: `call_${index}`,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              },
            ],
          },
        },
      ],
    }),
  );
  chunks.push({
    choices: [{ index: 0, delta: {}, finish_reason: reply.calls?.length ? "tool_calls" : "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

function server(replies: Reply[], galaxy: Record<string, unknown> = {}) {
  const requests: Array<Record<string, any>> = [];
  const hits: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    if (url.href.startsWith(LLM)) {
      requests.push(JSON.parse(await request.text()));
      return sse(replies.shift() ?? { text: "done" });
    }
    hits.push(`${request.method} ${url.pathname}`);
    const path = url.pathname.replace(/^\//, "");
    const body =
      path in galaxy ? galaxy[path] : path === "api/version" ? { version_major: "26.1" } : {};
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  });
  return { requests, hits };
}

const python: Python = { run: async () => "", write: async () => {}, read: async () => undefined };

const config = (over: Partial<SessionConfig> = {}): SessionConfig => ({
  galaxy_root: ROOT,
  ai_base_url: LLM,
  ai_model: "test-model",
  ai_api_key: "sk-test-secret-value",
  ...over,
});

const start: Message[] = [
  { role: "system", content: "You are olit." },
  { role: "user", content: "hi" },
];

async function turn(
  replies: Reply[],
  over: Partial<SessionConfig> = {},
  galaxy?: Record<string, unknown>,
) {
  const wire = server(replies, galaxy);
  const session = await Session.create(config(over), python);
  const events: LoopEvent[] = [];
  const result = await session.turn(start, { onEvent: (e) => events.push(e) });
  return { result, events, ...wire };
}

afterEach(() => vi.unstubAllGlobals());

describe("a turn", () => {
  it("streams the reply and returns it in the transcript", async () => {
    const { result, events } = await turn([{ text: "Hello there." }]);
    expect(events.filter((e) => e.type === "text").length).toBeGreaterThan(1);
    expect(result.new_messages).toEqual([{ role: "assistant", content: "Hello there." }]);
    expect(result.messages.at(-1)).toEqual({ role: "assistant", content: "Hello there." });
    expect(result.usage).toEqual({ input: 10, output: 5, cost: null });
    expect(result.steps).toBe(1);
  });

  it("runs a galaxy-ops tool under its galaxy-mcp name and reports it as events", async () => {
    const { result, events, hits } = await turn(
      [
        { calls: [{ name: "get_history_details", args: { history_id: "f2c1" } }] },
        { text: "Done." },
      ],
      {},
      { "api/histories/f2c1": { id: "f2c1", name: "RNA" } },
    );
    expect(hits).toContain("GET /api/histories/f2c1");
    const end = events.find((e) => e.type === "tool_end") as Extract<
      LoopEvent,
      { type: "tool_end" }
    >;
    expect(end).toMatchObject({ name: "get_history_details", is_error: false, refused: false });
    expect(result.new_messages.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
  });

  it("ends when finish runs, and says so", async () => {
    const { result } = await turn([{ calls: [{ name: "finish", args: { summary: "all done" } }] }]);
    expect(result.done).toBe(true);
    expect(result.steps).toBe(1);
  });

  it("stops at the step budget and reports it as a guard", async () => {
    const replies = Array.from({ length: 5 }, () => ({
      calls: [{ name: "get_server_info", args: {} }],
    }));
    const { result } = await turn(replies, { max_steps: 3 });
    expect(result.exhausted).toBe(true);
    expect(result.guards).toContainEqual({ guard: "max-steps", steps: 3 });
  });

  it("refuses a tool the session does not grant, naming the capability", async () => {
    const { result, events } = await turn(
      [{ calls: [{ name: "create_history", args: { history_name: "x" } }] }, { text: "ok" }],
      { capabilities: ["llm", "read"] },
    );
    const end = events.find((e) => e.type === "tool_end") as Extract<
      LoopEvent,
      { type: "tool_end" }
    >;
    expect(end).toMatchObject({ refused: true, guard: "capability" });
    expect(result.guards).toContainEqual({ guard: "capability", tool: "create_history" });
  });

  it("does not advertise a withheld tool", async () => {
    const { requests } = await turn([{ text: "ok" }], { capabilities: ["llm", "read"] });
    const names = requests[0].tools.map((t: { function: { name: string } }) => t.function.name);
    expect(names).toContain("get_histories");
    expect(names).not.toContain("create_history");
    expect(names).not.toContain("run_python");
  });

  it("withholds a process unless the grant covers every capability it declares", async () => {
    // organize_datasets declares read and write; write alone used to be enough.
    const { requests } = await turn([{ text: "ok" }], { capabilities: ["llm", "write"] });
    const names = requests[0].tools.map((t: { function: { name: string } }) => t.function.name);
    expect(names).toContain("create_history");
    expect(names).not.toContain("organize_datasets");
  });

  it("holds its rate limit across turns, not just within one", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    try {
      const { requests } = server([{ text: "one" }, { text: "two" }]);
      const session = await Session.create(config({ ai_rate_limit: 1 }), python);
      await session.turn(start);
      expect(requests).toHaveLength(1);
      const second = session.turn(start);
      await vi.advanceTimersByTimeAsync(30_000);
      // One request a minute: a new turn must not get a fresh allowance.
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(31_000);
      await second;
      expect(requests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the session's keys out of tool results", async () => {
    const { result } = await turn(
      [{ calls: [{ name: "get_history_details", args: { history_id: "f2c1" } }] }, { text: "ok" }],
      {},
      { "api/histories/f2c1": { id: "f2c1", annotation: "key sk-test-secret-value" } },
    );
    const tool = result.new_messages.find((m) => m.role === "tool")!;
    expect(tool.content).not.toContain("sk-test-secret-value");
    expect(tool.content).toContain("[redacted]");
  });

  it("keeps a key read from the environment out of tool results too", async () => {
    server(
      [{ calls: [{ name: "get_history_details", args: { history_id: "f2c1" } }] }, { text: "ok" }],
      { "api/histories/f2c1": { id: "f2c1", annotation: "key or-env-secret-value" } },
    );
    const session = await Session.create(
      config({ ai_provider: "openrouter", ai_api_key: undefined }),
      python,
      { OPENROUTER_KEY: "or-env-secret-value" },
    );
    const result = await session.turn(start);
    const tool = result.new_messages.find((m) => m.role === "tool")!;
    expect(tool.content).not.toContain("or-env-secret-value");
    expect(tool.content).toContain("[redacted]");
  });

  it("returns a failed provider call as an error with the transcript unchanged", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      return url.startsWith(LLM)
        ? new Response("bad request", { status: 400 })
        : new Response(JSON.stringify({ version_major: "26.1" }), {
            headers: { "content-type": "application/json" },
          });
    });
    const session = await Session.create(config(), python);
    const result = await session.turn(start);
    expect(result.error?.message).toBeTruthy();
    expect(result.messages).toEqual(start);
  });

  it("sends max_tokens only when one is configured", async () => {
    const unset = await turn([{ text: "ok" }]);
    expect(unset.requests[0]).not.toHaveProperty("max_tokens");
    const set = await turn([{ text: "ok" }], { ai_max_tokens: 512 });
    expect(set.requests[0].max_tokens).toBe(512);
  });

  it("keeps a mid-conversation system message in place", async () => {
    const wire = server([{ text: "ok" }]);
    const session = await Session.create(config(), python);
    const messages: Message[] = [
      { role: "system", content: "You are olit." },
      { role: "system", content: "<!-- olit:record -->\nrecord" },
      { role: "user", content: "hi" },
    ];
    await session.turn(messages);
    expect(wire.requests[0].messages.map((m: { role: string }) => m.role)).toEqual([
      "system",
      "system",
      "user",
    ]);
  });
});

describe("prepare", () => {
  it("puts the context block in the system message once", () => {
    const once = injectContext(start, "ctx");
    const twice = injectContext(once, "ctx2");
    expect(twice[0].content).toBe(
      "You are olit.\n\n<!-- olit:context -->\nctx2\n<!-- /olit:context -->",
    );
  });

  it("refreshes the record excerpt just before the last user turn", () => {
    const first = injectRecord(start, "one");
    const second = injectRecord(
      [...first, { role: "assistant", content: "a" }, { role: "user", content: "again" }],
      "two",
    );
    expect(second.filter((m) => (m.content ?? "").includes("olit:record"))).toHaveLength(1);
    expect(second.at(-2)).toEqual({ role: "system", content: "<!-- olit:record -->\ntwo" });
  });
});
