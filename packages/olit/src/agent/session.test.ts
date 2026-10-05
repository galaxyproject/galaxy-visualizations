import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { contentText, type AssistantMessage } from "@earendil-works/pi-ai";

import { toChat } from "./messages";
import { connect } from "./model";
import { resolve } from "./providers";
import {
  failedTurn,
  injectContext,
  injectRecord,
  Session,
  type LoopEvent,
  type SessionConfig,
} from "./session";
import { serialized } from "./record-write";
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
    if (typeof body === "function") {
      return body();
    }
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

const MISSING_HISTORY = {
  "api/histories/h404/contents": () =>
    new Response(JSON.stringify({ err_msg: "No such history" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
};
const failingRead = { name: "get_history_contents", args: { history_id: "h404", limit: "5" } };

describe("the repeated-failure guard", () => {
  it("refuses a model's fourth identical failing call, by the arguments pi validated", async () => {
    const replies = Array.from({ length: 4 }, () => ({ calls: [failingRead] }));
    const { result, events } = await turn(replies, { max_steps: 5 }, MISSING_HISTORY);
    const ends = events.filter((e) => e.type === "tool_end");
    expect(ends.slice(0, 3).every((e) => e.is_error && !e.refused)).toBe(true);
    expect(ends[3]).toMatchObject({ refused: true, guard: "repeated-failure" });
    expect(result.guards).toContainEqual({
      guard: "repeated-failure",
      tool: "get_history_contents",
    });
  });

  it("refuses the same on model-free calls", async () => {
    server([], MISSING_HISTORY);
    const session = await Session.create(config(), python);
    for (let i = 0; i < 3; i++) {
      expect(await session.call(failingRead.name, failingRead.args)).toMatchObject({
        is_error: true,
      });
    }
    expect(await session.call(failingRead.name, failingRead.args)).toMatchObject({
      is_error: true,
      guard: "repeated-failure",
    });
  });
});

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

  it("refuses a destructive galaxy-ops operation nobody can approve", async () => {
    const { result } = await turn([
      { calls: [{ name: "cancel_workflow_invocation", args: { invocation_id: "i1" } }] },
      { text: "ok" },
    ]);
    expect(result.guards).toContainEqual({
      guard: "destructive-declined",
      tool: "cancel_workflow_invocation",
    });
  });

  it("names an Olit tool asked for as a Galaxy tool, rather than letting Galaxy shrug", async () => {
    const { result } = await turn([
      {
        calls: [
          { name: "run_tool", args: { history_id: "h1", tool_id: "lineage_report", inputs: {} } },
        ],
      },
      { calls: [{ name: "search_tools_by_name", args: { query: "vega_dataset" } }] },
      { text: "ok" },
    ]);
    const tools = toChat(result.new_messages).filter((m) => m.role === "tool");
    expect(tools[0].content).toContain("'lineage_report' is an Olit tool, not a Galaxy tool");
    expect(tools[1].content).toContain("the tool catalog does not hold it");
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
      { OPENROUTER_API_KEY: "or-env-secret-value" },
    );
    const result = await session.turn(start);
    const tool = toChat(result.new_messages).find((m) => m.role === "tool")!;
    expect(tool.content).not.toContain("or-env-secret-value");
    expect(tool.content).toContain("[redacted]");
  });

  it("returns a failed provider call as an error, keeping the turn without the failed reply", async () => {
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
    const asked = (messages: AgentMessage[]) =>
      messages.filter((m) => m.role === "user").map((m) => (m as { content: unknown }).content);
    expect(asked(result.messages)).toEqual(asked(start));
    expect(result.messages.some((m) => m.role === "assistant")).toBe(false);
  });

  it("asks once more after a reply with neither text nor tool calls", async () => {
    const { result } = await turn([{ text: "" }, { text: "The answer." }, { text: "unused" }]);
    expect(result.steps).toBe(2);
    expect(contentText((result.messages.at(-1) as AssistantMessage).content)).toBe("The answer.");
  });

  it("does not start a turn whose Stop came first", async () => {
    server([{ calls: [{ name: "get_server_info", args: {} }] }]);
    const session = await Session.create(config(), python);
    const result = await session.turn(start, { signal: AbortSignal.abort() });
    expect(result.aborted).toBe(true);
    expect(result.steps).toBe(0);
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
      { role: "system", content: "A later instruction.", timestamp: 0 },
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
  const sections = (m: AgentMessage) => (m as { sections?: Record<string, string> }).sections;

  it("keeps the context as one section of the leading prompt", () => {
    const twice = injectContext(injectContext(start, "ctx"), "ctx2");
    expect(twice[0]).toMatchObject({ role: "system", content: "You are olit." });
    expect(sections(twice[0])).toEqual({ context: "ctx2" });
    expect(twice).toHaveLength(start.length);
  });

  it("refreshes the record section just before the last user turn", () => {
    const first = injectRecord(start, "one");
    const second = injectRecord(
      [
        ...first,
        { role: "assistant", content: [{ type: "text", text: "a" }], timestamp: 0 },
        { role: "user", content: "again", timestamp: 0 },
      ] as AgentMessage[],
      "two",
    );
    const updates = second.filter((m) => sections(m)?.record);
    expect(updates).toHaveLength(1);
    expect(second.at(-2)).toBe(updates[0]);
    expect(sections(updates[0])).toEqual({ record: "two" });
  });

  it("reaches the model as pi renders sections: the prompt, then the record update", async () => {
    const { model, streamFn } = await connect(resolve({ ai_base_url: LLM, ai_model: "m" }));
    const messages = injectRecord(injectContext(start, "CTX"), "RECORD-EXCERPT");
    let sent: { messages: Array<{ role: string; content: string }> } = { messages: [] };
    const stream = await streamFn(
      model,
      { messages } as never,
      {
        fetch: async () =>
          new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }),
        onPayload: (payload: unknown) => {
          sent = payload as typeof sent;
        },
      } as never,
    );
    await stream.result();
    expect(sent.messages).toEqual([
      { role: "system", content: "You are olit.\n\nCTX" },
      { role: "system", content: 'Updated system prompt section "record":\n\nRECORD-EXCERPT' },
      { role: "user", content: "hi" },
    ]);
  });
});

describe("the record the session keeps", () => {
  /** A Galaxy with one record page that keeps what is written to it, and one job. */
  function recordServer(replies: Reply[], job: { state: string }) {
    const page = { content: "# Notebook" };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      const url = new URL(request.url);
      if (url.href.startsWith(LLM)) {
        return sse(replies.shift() ?? { text: "done" });
      }
      const path = `${request.method} ${url.pathname.replace(/^\//, "")}`;
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      if (path === "PUT api/pages/p1") {
        page.content = JSON.parse(await request.text()).content;
        return json({});
      }
      if (path === "GET api/pages/p1") {
        return json({ content_editor: page.content });
      }
      if (path === "POST api/tools") {
        return json({ jobs: [{ id: "j1", state: "queued" }] });
      }
      if (path === "GET api/jobs/j1") {
        return json(job);
      }
      return json(path === "GET api/version" ? { version_major: "26.1" } : {});
    });
    return page;
  }

  const bound = { session_id: "s1", record_page_id: "p1", session_started_at: "2026-01-01" };
  const runTool = { name: "run_tool", args: { history_id: "h1", tool_id: "cat1", inputs: {} } };

  it("notes submitted work and its own session block, headless as in the browser", async () => {
    const page = recordServer([{ calls: [runTool] }, { text: "ok" }], { state: "queued" });
    const session = await Session.create(config(bound), python);
    await session.turn(start);
    expect(page.content).toContain("- [ ] Galaxy job `j1` — submitted, awaiting completion");
    expect(page.content).toMatch(/```olit-session\nid: s1\nstarted_at: 2026-01-01\n/);
  });

  it("marks the step done when the work it watches settles", async () => {
    const job = { state: "queued" };
    const page = recordServer([{ calls: [runTool] }, { text: "ok" }], job);
    const session = await Session.create(config(bound), python);
    await session.turn(start);
    job.state = "ok";
    const { settled } = await session.settle();
    expect(settled.map((s) => s.outcome)).toEqual(["completed"]);
    expect(page.content).toContain("- [x] Galaxy job `j1`");
    expect(page.content).toContain("Status: finished (ok) — recorded automatically");
  });

  it("writes nothing before the session has a record", async () => {
    const page = recordServer([{ calls: [runTool] }, { text: "ok" }], { state: "queued" });
    const session = await Session.create(config({ session_id: "s1" }), python);
    await session.turn(start);
    expect(page.content).toBe("# Notebook");
  });
});

describe("a model-free call", () => {
  it("is refused a tool the grant withholds, as a turn would be", async () => {
    server([]);
    const session = await Session.create(config({ capabilities: ["llm", "read"] }), python);
    const out = await session.call("run_python", { code: "1" });
    expect(out).toMatchObject({ is_error: true, guard: "capability" });
    expect(out.content).toContain("needs the 'local' capability");
  });

  it("notes what it submitted in the record, as a turn does", async () => {
    let page = "# Notebook";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      const path = `${request.method} ${new URL(request.url).pathname.replace(/^\//, "")}`;
      if (path === "PUT api/pages/p1") {
        page = JSON.parse(await request.text()).content;
      }
      const body =
        path === "GET api/pages/p1"
          ? { content_editor: page }
          : path === "POST api/tools"
            ? { jobs: [{ id: "j7", state: "queued" }] }
            : {};
      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      });
    });
    const session = await Session.create(config({ record_page_id: "p1" }), python);
    await session.call("run_tool", { history_id: "h1", tool_id: "cat1", inputs: {} });
    expect(page).toContain("Galaxy job `j7` — submitted");
  });
});

describe("Olit's policy over galaxy-ops' update_page", () => {
  /** A Galaxy whose page PUTs are recorded, in the order they arrive. */
  function pages() {
    const puts: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      const path = new URL(request.url).pathname;
      if (request.method === "PUT") {
        puts.push(path);
      }
      const body = path.endsWith("/api/version")
        ? { version_major: "26.1" }
        : { id: "p1", content_editor: "# Record\n" };
      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      });
    });
    return puts;
  }

  it("answers a directive id galaxy-ops refuses with where the right id comes from", async () => {
    const puts = pages();
    const session = await Session.create(config(), python);
    const out = await session.call("update_page", {
      page_id: "p1",
      content: "```galaxy\nhistory_dataset_display(history_dataset_id=reads)\n```\n",
    });
    expect(out).toMatchObject({ is_error: true });
    expect(out.content).toContain("history_dataset_id=reads");
    expect(out.content).toContain("{{artifact}}");
    expect(puts).toEqual([]);
  });

  it("leaves a refusal Olit has nothing to add to as galaxy-ops said it", async () => {
    pages();
    const session = await Session.create(config(), python);
    const out = await session.call("update_page", { page_id: "p1", section_heading: "## A" });
    expect(out.is_error).toBe(true);
    expect(out.content).not.toContain("{{artifact}}");
  });

  it("waits its turn in the session's record queue", async () => {
    const puts = pages();
    const session = await Session.create(config(), python);
    let release!: () => void;
    const held = serialized(() => new Promise<void>((resolve) => (release = resolve)));
    const write = session.call("update_page", { page_id: "p1", content: "# Record\n\nmore" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(puts).toEqual([]);
    release();
    await held;
    await write;
    expect(puts).toEqual(["/api/pages/p1"]);
  });
});
