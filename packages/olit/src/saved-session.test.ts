import { describe, expect, it, vi } from "vitest";
import { connectGalaxy } from "./agent/galaxy";
import { PLUGIN_TYPE, reportSavedState, savedSessions, title } from "./saved-session";
import {
  advance,
  isSessionDocument,
  newDocument,
  noteModel,
  restoreMessages,
  type SessionDocument,
} from "./session-document";
import { SessionStore, type Store } from "./session";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

const SEED = {
  role: "system",
  content: "You are Olit. Version one.",
  timestamp: 0,
} as AgentMessage;

function turn(d: SessionDocument, text: string, artifacts: any[] = []) {
  return advance(d, {
    messages: [SEED, ...d.messages, { role: "user", content: text, timestamp: 0 }],
    artifacts: [...d.artifacts, ...artifacts],
  });
}

/** A Galaxy that keeps visualizations in memory, so a "second machine" can read them back. */
function fakeGalaxy() {
  const rows = new Map<string, { title: string; config: unknown; type?: string }>();
  let next = 1;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchMock = vi.fn(async (request: Request) => {
    const id = request.url.split("/api/visualizations/")[1];
    if (request.method === "GET") {
      const row = rows.get(id!);
      return row ? json({ latest_revision: { config: row.config } }) : json("not found", 404);
    }
    const body = JSON.parse(await request.text());
    if (request.method === "POST") {
      const created = `v${next++}`;
      rows.set(created, body);
      return json({ id: created });
    }
    rows.set(id!, { ...rows.get(id!), ...body });
    return json({});
  });
  return { rows, fetchMock };
}

function memoryStore(): Store & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(key) {
      return data[key];
    },
    async put(key, value) {
      data[key] = value;
    },
    async remove(key) {
      delete data[key];
    },
  };
}

describe("a saved Olit visualization is a restorable session", () => {
  it("comes back whole on another machine", async () => {
    const { fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    const galaxy = savedSessions(connectGalaxy({ root: "http://galaxy/" }));

    // Machine one: a conversation with an artifact, then an explicit save.
    let doc = turn(newDocument({ historyId: "h1" }), "run fastqc", [
      { kind: "vega-lite", title: "counts", spec: { mark: "bar" } },
    ]);
    noteModel(doc, { provider: "openrouter", model: "x" });
    const id = await galaxy.save(doc);

    // Machine two: nothing local, opened from Galaxy's visualization list.
    const reopened = await galaxy.load(id);

    expect(reopened).not.toBeNull();
    expect(reopened!.session.id).toBe(doc.session.id);
    expect(reopened!.history_id).toBe("h1");
    expect(reopened!.artifacts).toEqual(doc.artifacts);
    expect(
      restoreMessages(reopened!, SEED).map((m) => ("content" in m ? m.content : undefined)),
    ).toContain("run fastqc");
    vi.unstubAllGlobals();
  });

  it("continues on the second machine and saves back to the same visualization", async () => {
    const { rows, fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    const galaxy = savedSessions(connectGalaxy({ root: "http://galaxy/" }));

    const id = await galaxy.save(turn(newDocument({ historyId: "h1" }), "first"));
    const continued = turn((await galaxy.load(id))!, "second");
    await galaxy.save(continued, id);

    expect(rows.size).toBe(1);
    const stored = (await galaxy.load(id))!;
    expect(stored.session.turn).toBe(2);
    expect(stored.messages.map((m) => ("content" in m ? m.content : undefined))).toEqual([
      "first",
      "second",
    ]);
    vi.unstubAllGlobals();
  });

  it("restores under the prompt the plugin ships today, not the one it started on", async () => {
    const { fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    const galaxy = savedSessions(connectGalaxy({ root: "http://galaxy/" }));

    const id = await galaxy.save(turn(newDocument({}), "hello"));
    const corrected = {
      role: "system",
      content: "You are Olit. Version two.",
      timestamp: 0,
    } as AgentMessage;

    expect(restoreMessages((await galaxy.load(id))!, corrected)[0]).toEqual(corrected);
    vi.unstubAllGlobals();
  });

  it("is created as the olit type and never shared", async () => {
    const { rows, fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);

    const id = await savedSessions(connectGalaxy({ root: "http://galaxy/" })).save(
      turn(newDocument({}), "a"),
    );
    const row = rows.get(id)! as any;

    expect(row.type).toBe(PLUGIN_TYPE);
    for (const key of ["importable", "published", "slug", "users_shared_with"]) {
      expect(row).not.toHaveProperty(key);
    }
    vi.unstubAllGlobals();
  });

  it("carries no credential into Galaxy", async () => {
    const doc = turn(newDocument({}), "a");
    noteModel(doc, { provider: "openrouter", model: "x" });
    expect(JSON.stringify(doc)).not.toMatch(/apiKey|baseUrl|Bearer|sk-/);
  });

  it("refuses a visualization that is not an Olit session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ latest_revision: { config: { settings: {}, tracks: [] } } }),
          ),
      ),
    );
    expect(await savedSessions(connectGalaxy({ root: "http://galaxy/" })).load("v1")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("meets Galaxy's three-character title minimum", () => {
    const doc = newDocument({});
    doc.session.title = "x";
    expect(title(doc).length).toBeGreaterThanOrEqual(3);
  });

  it("names a new session after itself, so two of them are told apart", () => {
    // Every saved session read "Olit session": the default was >= 3 chars, so the
    // fallback that carries the hash could never run.
    const one = title(newDocument({}));
    const two = title(newDocument({}));
    expect(one).toMatch(/^Olit Session \([0-9a-f]{8}\)$/);
    expect(one).not.toEqual(two);
  });

  it("keeps a name the user gave it", () => {
    const doc = newDocument({});
    doc.session.title = "Rabies dating run";
    expect(title(doc)).toBe("Rabies dating run");
  });

  it("surfaces a failed save instead of pretending it worked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    await expect(
      savedSessions(connectGalaxy({ root: "http://galaxy/" })).save(newDocument({})),
    ).rejects.toThrow(/500/);
    vi.unstubAllGlobals();
  });
});

describe("new conversation", () => {
  it("starts a fresh session without touching one already saved", async () => {
    const { rows, fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    const galaxy = savedSessions(connectGalaxy({ root: "http://galaxy/" }));
    const store = memoryStore();
    const local = new SessionStore(store, "u1");

    const first = turn(newDocument({ historyId: "h1" }), "first conversation");
    const id = await galaxy.save(first);
    await local.save(first);

    // Reset: a new document, and the saved one is left exactly as it was.
    const second = newDocument({ historyId: "h1" });
    await local.save(second);

    expect(second.session.id).not.toBe(first.session.id);
    expect((await galaxy.load(id))!.session.id).toBe(first.session.id);
    expect(rows.size).toBe(1);
    expect(await local.load(first.session.id)).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it("points the history at the new conversation for reload continuity", async () => {
    const store = memoryStore();
    const local = new SessionStore(store, "u1");
    const first = turn(newDocument({ historyId: "h1" }), "a");
    const second = newDocument({ historyId: "h1" });

    await local.save(first);
    await local.save(second);

    expect(await local.current("h1")).toBe(second.session.id);
  });
});

describe("local continuity", () => {
  it("keeps a stable session id across a reload", async () => {
    const store = memoryStore();
    const local = new SessionStore(store, "u1");
    const doc = turn(newDocument({ historyId: "h1" }), "a");
    await local.save(doc);

    // A reload: a new SessionStore over the same IndexedDB.
    const after = new SessionStore(store, "u1");
    const id = await after.current("h1");

    expect((await after.load(id!))!.session.id).toBe(doc.session.id);
  });

  it("is a convenience, not an authority: a saved session opens as saved", async () => {
    const { fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    const galaxy = savedSessions(connectGalaxy({ root: "http://galaxy/" }));
    const store = memoryStore();
    const local = new SessionStore(store, "u1");

    const doc = turn(newDocument({ historyId: "h1" }), "saved state");
    const id = await galaxy.save(doc);
    // The browser moved on without saving.
    await local.save(turn(doc, "unsaved local turn"));

    // Opening the saved visualization opens what was saved, with no merge and no prompt.
    const opened = await galaxy.load(id);
    expect(opened!.messages.map((m) => ("content" in m ? m.content : undefined))).toEqual([
      "saved state",
    ]);
    expect(isSessionDocument(opened)).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("reportSavedState", () => {
  /** Galaxy listens on the window that owns the iframe, so a report to our own window is lost. */
  function fakeParent() {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", { value: { postMessage }, configurable: true });
    return postMessage;
  }

  it("tells the embedding window that a turn left the session unsaved", () => {
    const postMessage = fakeParent();
    reportSavedState(false);
    expect(postMessage).toHaveBeenCalledWith(
      { from: "galaxy-visualization", visualization_saved: false },
      "*",
    );
  });

  it("tells the embedding window that a save stored the session", () => {
    const postMessage = fakeParent();
    reportSavedState(true);
    expect(postMessage).toHaveBeenCalledWith(
      { from: "galaxy-visualization", visualization_saved: true },
      "*",
    );
  });
});
