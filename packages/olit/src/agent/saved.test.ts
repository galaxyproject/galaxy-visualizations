import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Message } from "@earendil-works/pi-ai";
import {
  MemoryStorage,
  watchEvents,
  type AgentEvent,
  type Conversation,
  type Storage,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, describe, expect, it, vi } from "vitest";

import { savedSessions } from "../saved-session";
import { Binding } from "./documents";
import { json, text, visualizationStore } from "./fake-model";
import { connectGalaxy } from "./galaxy";
import { artifactsOf } from "../artifacts/kinds";
import { ChatView } from "../transcript";
import { artifactsIn, context, drawnEvents, Runtime, type RuntimeConfig } from "./runtime";
import { title, usageTotals, type SessionDocument } from "./saved";
import type { Python } from "./tool";

const ROOT = "http://galaxy.test/";
const LLM = "http://llm.test/v1";
const KEY = "sk-test-secret-value";
const USER = "f2db41e1fa331b3e";

/** A Galaxy keeping visualizations in memory, so a "second machine" reads them back, and a model. */
function world() {
  const { rows, answer } = visualizationStore(USER);
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    if (request.url.startsWith(LLM)) {
      requests.push(JSON.parse(await request.text()));
      return text(`answer ${requests.length}`);
    }
    return (
      (await answer(request)) ??
      json(request.url.endsWith("api/version") ? { version_major: "26.1" } : {})
    );
  });
  return { rows, requests, saved: savedSessions(connectGalaxy({ root: ROOT })) };
}

const CHART = { kind: "vega-lite", title: "counts", spec: { mark: "bar" } };
const chart: Message = {
  role: "toolResult",
  toolCallId: "c1",
  toolName: "vega_dataset",
  content: [{ type: "text", text: "charted" }],
  details: { artifacts: [CHART] },
  isError: false,
  timestamp: 0,
};

const python: Python = { run: async () => "", write: async () => {}, read: async () => undefined };
const opened: Runtime[] = [];

async function machine(
  storage: Storage = new MemoryStorage(),
  config: Partial<RuntimeConfig> = {},
) {
  const runtime = await Runtime.open({
    storage,
    config: { galaxy_root: ROOT, ai_base_url: LLM, ai_model: "m", ai_api_key: KEY, ...config },
    python,
  });
  opened.push(runtime);
  return runtime;
}

async function say(runtime: Runtime, conversation: Conversation, text: string) {
  await (await runtime.submit(conversation, text)).wait(context);
}

const said = (document: SessionDocument) =>
  document.entries.flatMap((e) =>
    (e.model ?? []).flatMap((m) =>
      m.role === "user" && typeof m.content === "string" ? [m.content] : [],
    ),
  );

afterEach(async () => {
  for (const runtime of opened.splice(0)) await runtime.close();
  vi.unstubAllGlobals();
});

describe("a saved Olit visualization is a restorable conversation", () => {
  it("comes back whole on another machine", async () => {
    const { saved } = world();
    const one = await machine();
    const conversation = await one.create({ historyId: "h1" });
    await say(one, conversation, "run fastqc");
    await conversation.commit(async (tx) => {
      await tx.appendEntry(conversation.id, { kind: "pi.tool-result", model: [chart] });
      (await tx.doc(Binding, conversation.id)).pageId = "abc123";
    }, context);
    const document = await one.export(conversation);
    const id = await saved.save(document);

    const two = await machine();
    const reopened = await two.open((await saved.load(id))!, id);
    const bound = await two.harness.snapshot(Binding, reopened.id, context);
    expect(bound).toMatchObject({
      sessionId: document.session.id,
      historyId: "h1",
      pageId: "abc123",
    });
    expect(artifactsOf((await reopened.context(context)).entries)).toEqual([CHART]);
    const messages = (await reopened.context(context)).messages;
    expect(messages.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["run fastqc"]);
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(1);
  });

  it("comes back across a compaction: the same context, and the earlier chart still placeable", async () => {
    const { saved } = world();
    const one = await machine();
    const conversation = await one.create({ historyId: "h1" });
    await say(one, conversation, "run fastqc");
    await conversation.commit(async (tx) => {
      await tx.appendEntry(conversation.id, { kind: "pi.tool-result", model: [chart] });
    }, context);
    await say(one, conversation, "after the chart");
    // A compaction as pi-durable places one: a summary that starts the context at itself.
    await conversation.commit(async (tx) => {
      await tx.appendEntry(conversation.id, {
        kind: "pi.compaction",
        model: [
          { role: "user", content: "<summary>ran fastqc, charted it</summary>", timestamp: 0 },
        ],
        head: "self",
      });
    }, context);
    const before = await conversation.context(context);
    const id = await saved.save(await one.export(conversation));

    const two = await machine();
    const reopened = await two.open((await saved.load(id))!, id);
    const after = await reopened.context(context);
    const roles = (view: typeof before) =>
      view.messages.filter((m) => m.role !== "system").map((m) => m.role);
    expect(roles(after)).toEqual(roles(before));
    expect(after.entries[0].kind).toBe("pi.compaction");
    expect((await artifactsIn(reopened, context)).map((a) => a.title)).toEqual([CHART.title]);
  });

  it("keeps the usage it was saved with when it continues on another machine", async () => {
    const { saved } = world();
    const one = await machine();
    const conversation = await one.create({ historyId: "h1" });
    await say(one, conversation, "first");
    const id = await saved.save(await one.export(conversation));

    const two = await machine();
    const reopened = await two.open((await saved.load(id))!, id);
    await say(two, reopened, "second");
    expect((await two.export(reopened)).session.usage).toEqual({
      input: 20,
      output: 10,
      cost: null,
    });
  });

  it("continues on the second machine and saves back to the same visualization", async () => {
    const { rows, saved } = world();
    const one = await machine();
    const first = await one.create({ historyId: "h1" });
    await say(one, first, "first");
    const id = await saved.save(await one.export(first));

    const two = await machine();
    const continued = await two.open((await saved.load(id))!, id);
    await say(two, continued, "second");
    await saved.save(await two.export(continued), id);

    expect(rows.size).toBe(1);
    const stored = (await saved.load(id))!;
    expect(stored.session.turn).toBe(2);
    expect(said(stored)).toEqual(["first", "second"]);
  });

  it("restores under the prompt the plugin ships today, not the one it started on", async () => {
    const { requests, saved } = world();
    const one = await machine();
    const first = await one.create({});
    await say(one, first, "hello");
    const document = await one.export(first);
    expect(document.entries.some((e) => e.kind === "pi.system")).toBe(false);

    const two = await machine();
    const reopened = await two.open((await saved.load(await saved.save(document)))!, "v1");
    await say(two, reopened, "again");
    const sent = requests.at(-1)!.messages;
    expect(sent[0].role).toBe("system");
    expect(sent[0].content).toContain("You are Olit.");
    expect(
      sent.filter((m) => m.role === "system" && m.content.includes("You are Olit.")),
    ).toHaveLength(1);
  });

  it("carries no credential into Galaxy", async () => {
    world();
    const one = await machine();
    const conversation = await one.create({});
    await say(one, conversation, "a");
    expect(JSON.stringify(await one.export(conversation))).not.toMatch(/apiKey|baseUrl|Bearer|sk-/);
  });

  it("says which build saved it", async () => {
    world();
    const one = await machine();
    const { build } = (await one.export(await one.create({}))).session;
    expect(build?.commit).toBe(process.env.olit_commit);
    expect(build?.commit).toMatch(/^[0-9a-f]{7,}$/);
  });

  it("names a new conversation after itself, so two of them are told apart", async () => {
    world();
    const one = await machine();
    const a = title(await one.export(await one.create({})));
    const b = title(await one.export(await one.create({})));
    expect(a).toMatch(/^Olit Session \([0-9a-f]{8}\)$/);
    expect(a).not.toEqual(b);
  });
});

describe("a new conversation", () => {
  it("starts afresh without touching one already saved, and the history continues it", async () => {
    const { rows, saved } = world();
    const one = await machine();
    const first = await one.create({ historyId: "h1" });
    await say(one, first, "first conversation");
    const document = await one.export(first);
    const id = await saved.save(document);

    const second = await one.create({ historyId: "h1" });
    const fresh = await one.export(second);
    expect(fresh.session.id).not.toBe(document.session.id);
    expect((await saved.load(id))!.session.id).toBe(document.session.id);
    expect(rows.size).toBe(1);
    expect((await one.continuing({ historyId: "h1" })).id).toBe(second.id);
  });
});

describe("local continuity", () => {
  it("continues the history's conversation after a reload, under the same identity", async () => {
    world();
    const file = join(mkdtempSync(join(tmpdir(), "olit-saved-")), "olit.sqlite3");
    const before = await machine(await openNodeSqliteStorage(file));
    const conversation = await before.create({ historyId: "h1" });
    await say(before, conversation, "a");
    const id = (await before.export(conversation)).session.id;
    await before.close();
    opened.splice(opened.indexOf(before), 1);

    const after = await machine(await openNodeSqliteStorage(file));
    const continued = await after.continuing({ historyId: "h1" });
    expect(continued.id).toBe(conversation.id);
    expect((await after.export(continued)).session.id).toBe(id);
  });

  it("continues a history's conversation on the dataset it is opened on this time", async () => {
    world();
    const one = await machine();
    const conversation = await one.create({ historyId: "h1", datasetId: "d1" });
    const continued = await one.continuing({ historyId: "h1", datasetId: "d2" });
    expect(continued.id).toBe(conversation.id);
    const bound = await one.harness.snapshot(Binding, continued.id, context);
    expect(bound).toMatchObject({ historyId: "h1", datasetId: "d2" });
  });

  it("opens a saved conversation as saved, not with turns the browser added since", async () => {
    const { saved } = world();
    const one = await machine();
    const conversation = await one.create({ historyId: "h1" });
    await say(one, conversation, "saved state");
    const document = await one.export(conversation);
    const id = await saved.save(document);
    await one.saved(conversation, id, document);
    await say(one, conversation, "unsaved local turn");

    const reopened = await one.open((await saved.load(id))!, id);
    expect(reopened.id).not.toBe(conversation.id);
    expect(said(await one.export(reopened))).toEqual(["saved state"]);
  });

  it("reopens the same conversation when nothing happened since the save", async () => {
    const { saved } = world();
    const one = await machine();
    const conversation = await one.create({ historyId: "h1" });
    await say(one, conversation, "saved state");
    const document = await one.export(conversation);
    const id = await saved.save(document);
    await one.saved(conversation, id, document);

    expect((await one.open((await saved.load(id))!, id)).id).toBe(conversation.id);
  });
});

describe("artifacts across a compaction", () => {
  const made = (id: number, title: string) =>
    ({
      id,
      kind: "pi.tool-result",
      model: [
        {
          role: "toolResult",
          details: { artifacts: [{ kind: "vega-lite", title, spec: {} }] },
        },
      ],
    }) as unknown as import("@earendil-works/pi-durable").EntryRecord;

  it("keeps a chart placeable after the turns that made it were summarized", async () => {
    // Newest first, two pages, as pi-durable hands a conversation's whole history back.
    const pages = [
      { items: [made(4, "After")], next: { page: 2 } },
      { items: [made(2, "Before")] },
    ];
    const conversation = {
      entries: async (_q: unknown, _limit: number, cursor: unknown) => pages[cursor ? 1 : 0],
    };
    const titles = (await artifactsIn(conversation as never, context)).map((a) => a.title);
    expect(titles).toEqual(["Before", "After"]);
  });
});

describe("a compacted conversation, as the page draws it", () => {
  /** What the page shows, in order: the user's messages, the replies and the notices. */
  function page() {
    const shown: string[] = [];
    const charts: string[][] = [];
    const ignore = () => {};
    const chat = {
      addUserMessage: (text: string) => shown.push(`user: ${text}`),
      appendDelta: (text: string) => shown.push(`reply: ${text}`),
      addToolCard: ignore,
      updateToolCard: ignore,
      startAssistantMessage: ignore,
      finishAssistantMessage: ignore,
      hideThinking: ignore,
      showThinking: ignore,
      clear: () => shown.splice(0),
    };
    const hooks = {
      info: (text: string) => shown.push(`info: ${text}`),
      artifacts: (made: Array<{ title: string }>, all: boolean) =>
        charts.push(...(all ? [made.map((a) => a.title)] : [])),
      busy: ignore,
      ended: ignore,
      usage: ignore,
      retry: ignore,
      retried: ignore,
      failed: ignore,
      wrote: ignore,
    };
    return { shown, charts, view: new ChatView(chat, hooks) };
  }

  const NOTICE = "info: Summarized the earlier conversation to make room.";

  /** Three turns, a chart in the first, and a compaction that lands before the third. */
  async function compacted(runtime: Runtime) {
    const conversation = await runtime.create({ historyId: "h1" });
    await say(runtime, conversation, "first");
    await conversation.commit(async (tx) => {
      await tx.appendEntry(conversation.id, { kind: "pi.tool-result", model: [chart] });
    }, context);
    await say(runtime, conversation, "second");
    await runtime.harness.waitForTask(await conversation.compact(undefined, context), context);
    await say(runtime, conversation, "third");
    const view = await conversation.context(context);
    expect(view.entries[0].kind).toBe("pi.compaction");
    expect(artifactsOf(view.entries)).toEqual([]);
    return conversation;
  }

  /** The page as an attach draws it: the snapshot a watch opens with. */
  async function attached(runtime: Runtime, conversation: Conversation) {
    const stream = await watchEvents(runtime.harness, conversation.id, context);
    await stream.stop();
    const drawn = page();
    drawn.view.apply(await drawnEvents(conversation, [stream.snapshot], context));
    return drawn;
  }

  const WHOLE = [
    "user: first",
    "reply: answer 1",
    "user: second",
    "reply: answer 2",
    NOTICE,
    "user: third",
    "reply: answer 4",
  ];

  it("shows every turn after a reload, the summary notice where the compaction landed", async () => {
    world();
    const file = join(mkdtempSync(join(tmpdir(), "olit-compacted-")), "olit.sqlite3");
    const one = await machine(await openNodeSqliteStorage(file), { ai_keep_recent_tokens: 1 });
    const conversation = await compacted(one);
    await one.close();
    opened.splice(opened.indexOf(one), 1);

    const two = await machine(await openNodeSqliteStorage(file), { ai_keep_recent_tokens: 1 });
    const reopened = (await two.harness.conversation(conversation.id, context))!;
    const { shown, charts } = await attached(two, reopened);
    expect(shown).toEqual(WHOLE);
    expect(charts).toEqual([[CHART.title]]);
  });

  it("shows every turn of a saved session opened on another machine", async () => {
    const { saved } = world();
    const one = await machine(new MemoryStorage(), { ai_keep_recent_tokens: 1 });
    const id = await saved.save(await one.export(await compacted(one)));

    const two = await machine();
    const reopened = await two.open((await saved.load(id))!, id);
    const { shown, charts } = await attached(two, reopened);
    expect(shown).toEqual(WHOLE);
    expect(charts).toEqual([[CHART.title]]);
  });

  it("redraws every turn from a snapshot a lagging page is sent instead of its batches", async () => {
    world();
    const runtime = await machine(new MemoryStorage(), { ai_keep_recent_tokens: 1 });
    const conversation = await compacted(runtime);
    const drawn = await attached(runtime, conversation);
    const stream = await watchEvents(runtime.harness, conversation.id, context);
    await stream.stop();
    // An overflow delivers one snapshot of the newest view in place of the undelivered batches.
    const recovered: AgentEvent[] = [stream.snapshot];
    drawn.view.apply(await drawnEvents(conversation, recovered, context));
    expect(drawn.shown).toEqual(WHOLE);
    expect(drawn.charts.at(-1)).toEqual([CHART.title]);
  });

  it("draws no entry committed after the snapshot, which the next batches bring", async () => {
    world();
    const runtime = await machine(new MemoryStorage(), { ai_keep_recent_tokens: 1 });
    const conversation = await compacted(runtime);
    const stream = await watchEvents(runtime.harness, conversation.id, context);
    await stream.stop();
    await say(runtime, conversation, "fourth");
    const drawn = page();
    drawn.view.apply(await drawnEvents(conversation, [stream.snapshot], context));
    expect(drawn.shown).toEqual(WHOLE);
  });

  it("passes a conversation that never compacted, and every other event, through as it is", async () => {
    world();
    const runtime = await machine();
    const conversation = await runtime.create({ historyId: "h1" });
    await say(runtime, conversation, "only");
    const stream = await watchEvents(runtime.harness, conversation.id, context);
    await stream.stop();
    const other = { type: "run_end" } as unknown as AgentEvent;
    const [snapshot, passed] = await drawnEvents(conversation, [stream.snapshot, other], context);
    expect(snapshot).toBe(stream.snapshot);
    expect(passed).toBe(other);
  });
});

describe("usage, as the page shows it and a saved session keeps it", () => {
  it("reports no cost, rather than zero, when no model reported one", () => {
    expect(usageTotals([{ input: 10, output: 2 }])).toEqual({ input: 10, output: 2, cost: null });
    expect(usageTotals([{ input: 1, output: 1, cost: { total: 0.5 } }]).cost).toBe(0.5);
  });
});
