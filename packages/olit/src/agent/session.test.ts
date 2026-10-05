import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { toChat } from "./messages";
import {
  failedTurn,
  injectContext,
  injectRecord,
  Session,
  type LoopEvent,
  type SessionConfig,
} from "./session";
import type { Python } from "./tool";

type Reply = {
  text?: string;
  reasoning?: string;
  calls?: Array<{ name: string; args: Record<string, unknown> }>;
};

const ROOT = "http://galaxy.test/";
const LLM = "http://llm.test/v1";

function sse(reply: Reply): Response {
  const chunks: unknown[] = [];
  if (reply.reasoning) {
    chunks.push({ choices: [{ index: 0, delta: { reasoning_content: reply.reasoning } }] });
  }
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

const start = [
  { role: "system", content: "You are olit.", timestamp: 0 },
  { role: "user", content: "hi", timestamp: 0 },
] as AgentMessage[];

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
    expect(toChat(result.new_messages)).toEqual([{ role: "assistant", content: "Hello there." }]);
    expect(toChat(result.messages).at(-1)).toEqual({ role: "assistant", content: "Hello there." });
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
    expect(result.new_messages.map((m) => m.role)).toEqual([
      "assistant",
      "toolResult",
      "assistant",
    ]);
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

  it("does not replay an earlier turn's reasoning as something the model said", async () => {
    const { requests } = server([{ reasoning: "PRIVATE-THOUGHT", text: "Hello." }, { text: "ok" }]);
    const session = await Session.create(config(), python);
    const first = await session.turn(start);
    await session.turn([
      ...first.messages,
      { role: "user", content: "again", timestamp: 0 } as AgentMessage,
    ]);
    const replayed = requests[1].messages.find((m: { role: string }) => m.role === "assistant");
    expect(replayed.content).toBe("Hello.");
    expect(String(replayed.content)).not.toContain("PRIVATE-THOUGHT");
  });

  it("stops a Galaxy request in flight when the turn is stopped", async () => {
    let aborted = false;
    const requests: unknown[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      const url = new URL(request.url);
      if (url.href.startsWith(LLM)) {
        requests.push(1);
        return sse({ calls: [{ name: "get_history_details", args: { history_id: "f2c1" } }] });
      }
      if (url.pathname.endsWith("api/histories/f2c1")) {
        // A Galaxy that never answers, until the request is abandoned.
        return new Promise((_resolve, reject) =>
          request.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          }),
        );
      }
      return new Response("{}", { headers: { "content-type": "application/json" } });
    });
    const session = await Session.create(config(), python);
    const controller = new AbortController();
    const running = session.turn(start, { signal: controller.signal });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    controller.abort();
    const result = await running;
    expect(aborted).toBe(true);
    expect(result.aborted).toBe(true);
    expect(result.error).toBeUndefined();
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
    const tool = toChat(result.new_messages).find((m) => m.role === "tool")!;
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
    const tool = toChat(result.new_messages).find((m) => m.role === "tool")!;
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
    const messages = [
      { role: "system", content: "You are olit.", timestamp: 0 },
      { role: "system", content: "<!-- olit:record -->\nrecord", timestamp: 0 },
      { role: "user", content: "hi", timestamp: 0 },
    ] as AgentMessage[];
    await session.turn(messages);
    expect(wire.requests[0].messages.map((m: { role: string }) => m.role)).toEqual([
      "system",
      "system",
      "user",
    ]);
  });
});

describe("failedTurn", () => {
  it("claims nothing about Galaxy, so an unrelated error cannot block a plan", () => {
    const result = failedTurn(start, new Error("worker crashed"));
    expect(result.error?.message).toBe("worker crashed");
    expect(result).not.toHaveProperty("diagnostics");
  });
});

describe("rebind", () => {
  it("takes the session and record it is given, so a new conversation drops the old record", async () => {
    server([]);
    const session = await Session.create(
      config({ session_id: "s1", record_page_id: "p1" }),
      python,
    );
    session.rebind({ session_id: "s2", record_page_id: undefined });
    expect(session.binding).toEqual({ sessionId: "s2", pageId: undefined, historyId: undefined });
  });
});

describe("the history a session is bound to", () => {
  it("moves to a history the agent creates, and says so when it happens", async () => {
    const { result, events } = await turn(
      [{ calls: [{ name: "create_history", args: { history_name: "x" } }] }, { text: "ok" }],
      { history_id: "h1" },
      { "api/histories": { id: "hnew", name: "x", model_class: "History" } },
    );
    expect(result.binding?.history_id).toBe("hnew");
    const end = events.find((e) => e.type === "tool_end") as Extract<
      LoopEvent,
      { type: "tool_end" }
    >;
    expect(end.binding?.history_id).toBe("hnew");
  });

  it("stays put when a result merely mentions another history", async () => {
    const { result, events } = await turn(
      [{ calls: [{ name: "get_dataset_details", args: { dataset_id: "d9" } }] }, { text: "ok" }],
      { history_id: "h1" },
      { "api/datasets/d9": { id: "d9", history_id: "elsewhere", name: "x" } },
    );
    expect(events.find((e) => e.type === "tool_end")).toMatchObject({ is_error: false });
    expect(result.binding?.history_id).toBe("h1");
    expect(events.some((e) => e.type === "tool_end" && e.binding)).toBe(false);
  });

  it("binds an unbound session to the history the agent writes into", async () => {
    const { result, events } = await turn(
      [
        { calls: [{ name: "update_history", args: { history_id: "hw", name: "renamed" } }] },
        { text: "ok" },
      ],
      {},
      { "api/histories/hw": { id: "hw", name: "renamed" } },
    );
    expect(events.find((e) => e.type === "tool_end")).toMatchObject({ is_error: false });
    expect(result.binding?.history_id).toBe("hw");
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
    const second = toChat(
      injectRecord(
        [
          ...first,
          { role: "assistant", content: [{ type: "text", text: "a" }], timestamp: 0 },
          { role: "user", content: "again", timestamp: 0 },
        ] as AgentMessage[],
        "two",
      ),
    );
    expect(second.filter((m) => (m.content ?? "").includes("olit:record"))).toHaveLength(1);
    expect(second.at(-2)).toEqual({ role: "system", content: "<!-- olit:record -->\ntwo" });
  });
});
