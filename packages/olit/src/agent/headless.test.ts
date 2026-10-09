import { contentText, type Message } from "@earendil-works/pi-ai";
import type { EntryRecord } from "@earendil-works/pi-durable";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Binding } from "./documents";
import { Headless, type HeadlessConfig } from "./headless";
import { EMPTY_REPLY, FOLLOW_UP_MARK } from "./markers";
import { pageContentProblem } from "./page-edit";
import { serialized } from "./record-write";
import { context } from "./runtime";
import type { Python } from "./tool";

type Reply = {
  text?: string;
  reasoning?: string;
  calls?: Array<{ name: string; args: Record<string, unknown> }>;
};

const ROOT = "http://galaxy.test/";
const LLM = "http://llm.test/v1";

let callIds = 0;

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
                id: `call_${++callIds}`,
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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
    return typeof body === "function" ? body() : json(body);
  });
  return { requests, hits };
}

const python: Python = { run: async () => "", write: async () => {}, read: async () => undefined };

const config = (over: Partial<HeadlessConfig> = {}): HeadlessConfig => ({
  galaxy_root: ROOT,
  ai_base_url: LLM,
  ai_model: "test-model",
  ai_api_key: "sk-test-secret-value",
  ...over,
});

const opened: Headless[] = [];

async function open(over: Partial<HeadlessConfig> = {}, env?: Record<string, string>) {
  const session = await Headless.open(config(over), { python, env, pollMs: 10 });
  opened.push(session);
  return session;
}

async function turn(
  replies: Reply[],
  over: Partial<HeadlessConfig> = {},
  galaxy?: Record<string, unknown>,
) {
  const wire = server(replies, galaxy);
  const session = await open(over);
  const result = await session.turn("hi");
  return { result, session, ...wire };
}

const messages = (entries: readonly EntryRecord[]) =>
  entries.flatMap((e) => (e.kind === "pi.system" ? [] : ((e.model ?? []) as Message[])));

type Result = Extract<Message, { role: "toolResult" }>;
const results = (entries: readonly EntryRecord[]) =>
  messages(entries).filter((m): m is Result => m.role === "toolResult");
const guardOf = (m: Result) => (m.details as { guard?: string } | undefined)?.guard;
const answers = (entries: readonly EntryRecord[]) =>
  messages(entries)
    .filter((m) => m.role === "assistant")
    .map((m) => contentText(m.content));
const asked = (entries: readonly EntryRecord[]) =>
  messages(entries)
    .filter((m) => m.role === "user")
    .map((m) => contentText(m.content));

const bound = (session: Headless) =>
  session.runtime.harness.snapshot(Binding, session.conversation.id, context);

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  vi.unstubAllGlobals();
});

const MISSING_HISTORY = {
  "api/histories/h404/contents": () => json({ err_msg: "No such history" }, 404),
};
const failingRead = { name: "get_history_contents", args: { history_id: "h404", limit: "5" } };

describe("the repeated-failure guard", () => {
  it("refuses a model's fourth identical failing call, by the arguments it was checked with", async () => {
    const replies = Array.from({ length: 4 }, () => ({ calls: [failingRead] }));
    const { result } = await turn(replies, { max_steps: 5 }, MISSING_HISTORY);
    const ends = results(result.entries);
    expect(ends.slice(0, 3).every((m) => m.isError && !guardOf(m))).toBe(true);
    expect(guardOf(ends[3])).toBe("repeated-failure");
  });

  it("forgets the failures when the user writes again", async () => {
    const failing = Array.from({ length: 3 }, () => ({ calls: [failingRead] }));
    server([...failing, { text: "ok" }, { calls: [failingRead] }, { text: "ok" }], MISSING_HISTORY);
    const session = await open();
    await session.turn("hi");
    const next = await session.turn("again");
    expect(results(next.entries).map(guardOf)).toEqual([undefined]);
  });
});

describe("a turn", () => {
  it("answers in the transcript", async () => {
    const { result } = await turn([{ text: "Hello there." }]);
    expect(result.status).toBe("done");
    expect(answers(result.entries)).toEqual(["Hello there."]);
  });

  it("runs a galaxy-ops tool under its galaxy-mcp name", async () => {
    const { result, hits } = await turn(
      [
        { calls: [{ name: "get_history_details", args: { history_id: "f2c1" } }] },
        { text: "Done." },
      ],
      {},
      { "api/histories/f2c1": { id: "f2c1", name: "RNA" } },
    );
    expect(hits).toContain("GET /api/histories/f2c1");
    expect(results(result.entries)).toMatchObject([
      { toolName: "get_history_details", isError: false },
    ]);
  });

  it("ends when finish runs", async () => {
    const { result } = await turn([{ calls: [{ name: "finish", args: { summary: "all done" } }] }]);
    expect(result.status).toBe("done");
    expect(contentText(results(result.entries)[0].content)).toBe("all done");
  });

  it("ends a run that spends its turns, as pi-durable's turn limit", async () => {
    const replies = Array.from({ length: 5 }, () => ({
      calls: [{ name: "get_server_info", args: {} }],
    }));
    const { result } = await turn(replies, { max_steps: 3 });
    expect(result).toMatchObject({ status: "unanswered", reason: "turn_limit" });
    expect(results(result.entries)).toHaveLength(3);
  });

  it("refuses a tool the session does not grant, naming the capability", async () => {
    const { result } = await turn(
      [{ calls: [{ name: "create_history", args: { history_name: "x" } }] }, { text: "ok" }],
      { capabilities: ["llm", "read"] },
    );
    const [refused] = results(result.entries);
    expect(guardOf(refused)).toBe("capability");
    expect(contentText(refused.content)).toContain("needs the 'write' capability");
  });

  it("refuses a destructive galaxy-ops operation nobody can approve", async () => {
    const { result } = await turn([
      { calls: [{ name: "cancel_workflow_invocation", args: { invocation_id: "i1" } }] },
      { text: "ok" },
    ]);
    const [refused] = results(result.entries);
    expect(guardOf(refused)).toBe("destructive-declined");
    expect(contentText(refused.content).startsWith("Refused:")).toBe(true);
  });

  it("asks about a destructive call each time, never refusing it as a repeated failure", async () => {
    const cancel = {
      calls: [{ name: "cancel_workflow_invocation", args: { invocation_id: "i1" } }],
    };
    const { result } = await turn([cancel, cancel, cancel, cancel, { text: "ok" }]);
    expect(results(result.entries).map(guardOf)).toEqual(Array(4).fill("destructive-declined"));
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
    const [first, second] = results(result.entries).map((m) => contentText(m.content));
    expect(first).toContain("'lineage_report' is an Olit tool, not a Galaxy tool");
    expect(second).toContain("the tool catalog does not hold it");
  });

  it("does not advertise a withheld tool", async () => {
    const { requests } = await turn([{ text: "ok" }], { capabilities: ["llm", "read"] });
    const names = requests[0].tools.map((t: { function: { name: string } }) => t.function.name);
    expect(names).toContain("get_histories");
    expect(names).not.toContain("create_history");
    expect(names).not.toContain("run_python");
  });

  it("withholds a process unless the grant covers every capability it declares", async () => {
    const { requests } = await turn([{ text: "ok" }], { capabilities: ["llm", "write"] });
    const names = requests[0].tools.map((t: { function: { name: string } }) => t.function.name);
    expect(names).toContain("create_history");
    expect(names).not.toContain("organize_datasets");
  });

  it("does not replay an earlier turn's reasoning as something the model said", async () => {
    const { requests } = server([{ reasoning: "PRIVATE-THOUGHT", text: "Hello." }, { text: "ok" }]);
    const session = await open();
    await session.turn("hi");
    await session.turn("again");
    const replayed = requests[1].messages.find((m: { role: string }) => m.role === "assistant");
    expect(replayed.content).toBe("Hello.");
    expect(String(replayed.content)).not.toContain("PRIVATE-THOUGHT");
  });

  it("stops a Galaxy request in flight when the conversation is stopped", async () => {
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
        return new Promise((_resolve, reject) =>
          request.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          }),
        );
      }
      return json({});
    });
    const session = await open();
    const running = session.turn("hi");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    await session.runtime.hold([session.conversation]);
    expect(await running).toMatchObject({ status: "unanswered", reason: "aborted" });
    expect(aborted).toBe(true);
  });

  it("keeps the session's keys out of tool results", async () => {
    const { result } = await turn(
      [{ calls: [{ name: "get_history_details", args: { history_id: "f2c1" } }] }, { text: "ok" }],
      {},
      { "api/histories/f2c1": { id: "f2c1", annotation: "key sk-test-secret-value" } },
    );
    const text = contentText(results(result.entries)[0].content);
    expect(text).not.toContain("sk-test-secret-value");
    expect(text).toContain("[redacted]");
  });

  it("keeps a key read from the environment out of tool results too", async () => {
    server(
      [{ calls: [{ name: "get_history_details", args: { history_id: "f2c1" } }] }, { text: "ok" }],
      { "api/histories/f2c1": { id: "f2c1", annotation: "key or-env-secret-value" } },
    );
    const session = await open(
      { ai_provider: "openrouter", ai_api_key: undefined },
      { OPENROUTER_API_KEY: "or-env-secret-value" },
    );
    const result = await session.turn("hi");
    const text = contentText(results(result.entries)[0].content);
    expect(text).not.toContain("or-env-secret-value");
    expect(text).toContain("[redacted]");
  });

  it("settles a failed provider call unanswered", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      return url.startsWith(LLM)
        ? new Response("bad request", { status: 400 })
        : json({ version_major: "26.1" });
    });
    const session = await open();
    expect((await session.turn("hi")).status).toBe("unanswered");
  });

  it("asks once more after a reply with neither text nor tool calls", async () => {
    const { result } = await turn([{ text: "" }, { text: "The answer." }, { text: "unused" }]);
    expect(answers(result.entries).at(-1)).toBe("The answer.");
    expect(asked(result.entries)).toEqual(["hi", EMPTY_REPLY]);
  });

  it("asks again after a later empty reply once a tool call came between", async () => {
    const call = { calls: [{ name: "get_history_details", args: { history_id: "h1" } }] };
    const { result } = await turn([{ text: "" }, call, { text: "" }, { text: "The answer." }]);
    expect(answers(result.entries).at(-1)).toBe("The answer.");
    expect(asked(result.entries)).toEqual(["hi", EMPTY_REPLY, EMPTY_REPLY]);
  });

  it("ends the turn on a second empty reply in a row", async () => {
    const { result } = await turn([{ text: "" }, { text: "" }, { text: "unused" }]);
    expect(asked(result.entries)).toEqual(["hi", EMPTY_REPLY]);
    expect(answers(result.entries)).not.toContain("unused");
  });

  it("sends max_tokens only when one is configured", async () => {
    const unset = await turn([{ text: "ok" }]);
    expect(unset.requests[0]).not.toHaveProperty("max_tokens");
    const set = await turn([{ text: "ok" }], { ai_max_tokens: 512 });
    expect(set.requests[0].max_tokens).toBe(512);
  });

  it("puts the prompt first and the record excerpt just before the user's message", async () => {
    const { requests } = await turn([{ text: "ok" }], { history_id: "h1" });
    const sent = requests[0].messages as Array<{ role: string; content: string }>;
    expect(sent[0].role).toBe("system");
    expect(sent[0].content).toContain("You are Olit.");
    expect(sent.at(-2)!.content).toContain('Updated system prompt section "record"');
    expect(sent.at(-2)!.content).toContain("history `h1`");
    expect(sent.at(-1)).toEqual({ role: "user", content: "hi" });
  });
});

describe("a restart, as a browser with nothing stored does it", () => {
  const RECORD = {
    id: "p7",
    slug: "olit-sess-7",
    title: "Olit Notebook (sess-7)",
    create_time: "2026-10-01T09:00:00",
    update_time: "2026-10-02T09:00:00",
  };

  async function launched(pages: unknown[]) {
    server([{ text: "ok" }], { "api/pages": pages });
    const session = await open({ history_id: "h1", dataset_id: "d1" });
    await session.runtime.harness.commit(async (tx) => {
      Object.assign(await tx.doc(Binding, session.conversation.id), { pageId: "p1" });
    }, context);
    return session;
  }

  it("starts a new session at once, as Reset does, when the history has no records", async () => {
    const session = await launched([]);
    const before = await bound(session);
    expect(await session.restart()).toEqual([]);
    const after = await bound(session);
    expect(after).toMatchObject({ historyId: "h1", datasetId: "d1" });
    expect(after?.pageId).toBeUndefined();
    expect(after?.sessionId).not.toBe(before?.sessionId);
  });

  it("offers the history's records and starts nothing until told which session this is", async () => {
    const session = await launched([RECORD, { id: "p9", slug: "not-olit", title: "Mine" }]);
    const before = session.conversation.id;
    const offered = await session.restart();
    expect(offered.map((r) => r.pageId)).toEqual(["p7"]);
    expect(session.conversation.id).toBe(before);
    await session.recover("p7");
    expect(session.conversation.id).not.toBe(before);
    // The session's identity and record come back; its conversation does not.
    expect(await bound(session)).toMatchObject({
      sessionId: "sess-7",
      pageId: "p7",
      historyId: "h1",
      startedAt: "2026-10-01T09:00:00",
    });
    expect((await session.conversation.context(context)).entries).toEqual([]);
  });

  it("starts new when told so, even with records on offer", async () => {
    const session = await launched([RECORD]);
    await session.restart();
    await session.recover();
    expect((await bound(session))?.sessionId).not.toBe("sess-7");
    expect((await bound(session))?.pageId).toBeUndefined();
  });
});

describe("the history a conversation is bound to", () => {
  it("stays on the history it was launched on when the agent creates another", async () => {
    const { session } = await turn(
      [{ calls: [{ name: "create_history", args: { history_name: "x" } }] }, { text: "ok" }],
      { history_id: "h1" },
      { "api/histories": { id: "hnew", name: "x", model_class: "History" } },
    );
    expect((await bound(session))?.historyId).toBe("h1");
  });

  it("does not take a history the agent creates when it was launched on none", async () => {
    const { session } = await turn(
      [{ calls: [{ name: "create_history", args: { history_name: "x" } }] }, { text: "ok" }],
      {},
      { "api/histories": { id: "hnew", name: "x", model_class: "History" } },
    );
    expect((await bound(session))?.historyId).toBeUndefined();
  });

  it("stays put when a result merely mentions another history", async () => {
    const { session, result } = await turn(
      [{ calls: [{ name: "get_dataset_details", args: { dataset_id: "d9" } }] }, { text: "ok" }],
      { history_id: "h1" },
      { "api/datasets/d9": { id: "d9", history_id: "elsewhere", name: "x" } },
    );
    expect(results(result.entries)[0].isError).toBe(false);
    expect((await bound(session))?.historyId).toBe("h1");
  });

  it("does not take a history the agent writes into when it was launched on none", async () => {
    const { session } = await turn(
      [
        { calls: [{ name: "update_history", args: { history_id: "hw", name: "renamed" } }] },
        { text: "ok" },
      ],
      {},
      { "api/histories/hw": { id: "hw", name: "renamed" } },
    );
    expect((await bound(session))?.historyId).toBeUndefined();
  });
});

describe("the record and the work the conversation watches", () => {
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
      if (path === "PUT api/pages/p1") {
        page.content = JSON.parse(await request.text()).content;
        return json({});
      }
      if (path === "GET api/pages/p1") return json({ content_editor: page.content });
      if (path === "POST api/tools") return json({ jobs: [{ id: "j1", state: "queued" }] });
      if (path === "GET api/jobs/j1") return json(job);
      return json(path === "GET api/version" ? { version_major: "26.1" } : {});
    });
    return page;
  }

  async function recorded(replies: Reply[], job: { state: string }, pageId?: string) {
    const page = recordServer(replies, job);
    const session = await open();
    await session.conversation.commit(async (tx) => {
      Object.assign(await tx.doc(Binding, session.conversation.id), {
        sessionId: "s1",
        startedAt: "2026-01-01",
        ...(pageId ? { pageId } : {}),
      });
    }, context);
    return { page, session };
  }

  const runTool = { name: "run_tool", args: { history_id: "h1", tool_id: "cat1", inputs: {} } };

  it("notes submitted work as page content Galaxy renders", async () => {
    const { page, session } = await recorded(
      [{ calls: [runTool] }, { text: "ok" }],
      { state: "queued" },
      "p1",
    );
    await session.turn("hi");
    await vi.waitFor(() =>
      expect(page.content).toContain("- [ ] Galaxy job `j1` — submitted, awaiting completion"),
    );
    expect(pageContentProblem(page.content)).toBeUndefined();
  });

  it("marks the step done when the work settles, and follows up in a run of its own", async () => {
    const job = { state: "queued" };
    const { page, session } = await recorded(
      [{ calls: [runTool] }, { text: "ok" }, { text: "Checked." }],
      job,
      "p1",
    );
    await session.turn("hi");
    job.state = "ok";
    const { settled, entries } = await session.settle(10);
    expect(settled.map((s) => s.outcome)).toEqual(["completed"]);
    expect(page.content).toContain("- [x] Galaxy job `j1`");
    expect(page.content).toContain("recorded automatically");
    expect(asked(entries)[0].startsWith(FOLLOW_UP_MARK)).toBe(true);
    expect(answers(entries)).toEqual(["Checked."]);
  });

  it("holds the follow-up after a Stop until the user writes, then answers both", async () => {
    const job = { state: "queued" };
    const { session } = await recorded(
      [{ calls: [runTool] }, { text: "ok" }, { text: "Both." }],
      job,
    );
    await session.turn("hi");
    await session.runtime.hold([session.conversation]);
    await session.conversation.waitForIdle(context);
    job.state = "ok";
    const quiet = await session.settle(5);
    expect(quiet.settled).toHaveLength(1);
    expect(answers(quiet.entries)).toEqual([]);
    const next = await session.turn("continue");
    const said = asked(next.entries);
    expect(said[0].startsWith(FOLLOW_UP_MARK)).toBe(true);
    expect(said[1]).toBe("continue");
    expect(answers(next.entries)).toEqual(["Both."]);
  });

  it("writes nothing before the conversation has a record", async () => {
    const { page, session } = await recorded([{ calls: [runTool] }, { text: "ok" }], {
      state: "queued",
    });
    await session.turn("hi");
    expect(page.content).toBe("# Notebook");
  });
});

describe("Olit's policy over galaxy-ops' update_page", () => {
  /** A Galaxy whose page PUTs are recorded, in the order they arrive. */
  function pages(replies: Reply[]) {
    const puts: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      if (request.url.startsWith(LLM)) return sse(replies.shift() ?? { text: "done" });
      const path = new URL(request.url).pathname;
      if (request.method === "PUT") {
        puts.push(path);
      }
      return json(
        path.endsWith("/api/version")
          ? { version_major: "26.1" }
          : { id: "p1", content_editor: "# Record\n" },
      );
    });
    return puts;
  }

  const update = (args: Record<string, unknown>) => [
    { calls: [{ name: "update_page", args: { page_id: "p1", ...args } }] },
    { text: "ok" },
  ];

  it("answers a directive id galaxy-ops refuses with where the right id comes from", async () => {
    const puts = pages(
      update({ content: "```galaxy\nhistory_dataset_display(history_dataset_id=reads)\n```\n" }),
    );
    const result = await (await open()).turn("write it");
    const [refused] = results(result.entries);
    expect(refused.isError).toBe(true);
    expect(contentText(refused.content)).toContain("history_dataset_id=reads");
    expect(contentText(refused.content)).toContain("{{artifact}}");
    expect(puts).toEqual([]);
  });

  it("leaves a refusal Olit has nothing to add to as galaxy-ops said it", async () => {
    pages(update({ section_heading: "## A" }));
    const result = await (await open()).turn("write it");
    const [refused] = results(result.entries);
    expect(refused.isError).toBe(true);
    expect(contentText(refused.content)).not.toContain("{{artifact}}");
  });

  it("waits its turn in the record queue", async () => {
    const puts = pages(update({ content: "# Record\n\nmore" }));
    const session = await open();
    let release!: () => void;
    const held = serialized(() => new Promise<void>((resolve) => (release = resolve)));
    const write = session.turn("write it");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(puts).toEqual([]);
    release();
    await held;
    await write;
    expect(puts).toEqual(["/api/pages/p1"]);
  });
});
