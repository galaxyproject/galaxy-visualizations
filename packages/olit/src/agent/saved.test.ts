import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Message } from "@earendil-works/pi-ai";
import { MemoryStorage, type Conversation, type Storage } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, describe, expect, it, vi } from "vitest";

import { savedSessions } from "../saved-session";
import { Binding } from "./documents";
import { connectGalaxy } from "./galaxy";
import { artifactsOf } from "../artifacts/kinds";
import { artifactsIn, context, Runtime } from "./runtime";
import { title, usageTotals, type SessionDocument } from "./saved";
import type { Python } from "./tool";

const ROOT = "http://galaxy.test/";
const LLM = "http://llm.test/v1";
const KEY = "sk-test-secret-value";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function reply(text: string): Response {
  const chunks = [
    { choices: [{ index: 0, delta: { content: text } }] },
    {
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    },
  ];
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

/** A Galaxy keeping visualizations in memory, so a "second machine" reads them back, and a model. */
function world() {
  const rows = new Map<string, Record<string, unknown>>();
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  let next = 1;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    if (request.url.startsWith(LLM)) {
      requests.push(JSON.parse(await request.text()));
      return reply(`answer ${requests.length}`);
    }
    const id = request.url.split("/api/visualizations/")[1];
    if (request.url.includes("/api/visualizations")) {
      if (request.method === "GET") {
        const row = rows.get(id!);
        return row ? json({ latest_revision: { config: row.config } }) : json("not found", 404);
      }
      const body = JSON.parse(await request.text());
      if (request.method === "POST") {
        rows.set(`v${next}`, body);
        return json({ id: `v${next++}` });
      }
      rows.set(id!, { ...rows.get(id!), ...body });
      return json({});
    }
    return json(request.url.endsWith("api/version") ? { version_major: "26.1" } : {});
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

async function machine(storage: Storage = new MemoryStorage()) {
  const runtime = await Runtime.open({
    storage,
    config: { galaxy_root: ROOT, ai_base_url: LLM, ai_model: "m", ai_api_key: KEY },
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

describe("usage, as the page shows it and a saved session keeps it", () => {
  it("reports no cost, rather than zero, when no model reported one", () => {
    expect(usageTotals([{ input: 10, output: 2 }])).toEqual({ input: 10, output: 2, cost: null });
    expect(usageTotals([{ input: 1, output: 1, cost: { total: 0.5 } }]).cost).toBe(0.5);
  });
});
