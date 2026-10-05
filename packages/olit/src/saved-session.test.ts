import { describe, expect, it, vi } from "vitest";
import { connectGalaxy } from "./agent/galaxy";
import { SCHEMA, title, type SessionDocument } from "./agent/saved";
import { PLUGIN_TYPE, reportSavedState, savedSessions } from "./saved-session";

const document = (over: Partial<SessionDocument["session"]> = {}): SessionDocument => ({
  olit_session: SCHEMA,
  session: {
    id: "0123abcd-0000-0000-0000-000000000000",
    title: "",
    createdAt: "2026-10-06T00:00:00Z",
    updatedAt: "2026-10-06T00:00:00Z",
    turn: 1,
    models: [],
    usage: { input: 0, output: 0, cost: null },
    ...over,
  },
  entries: [{ kind: "pi.user", model: [{ role: "user", content: "a", timestamp: 0 }] }],
});

/** A Galaxy that keeps visualizations in memory. */
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

describe("a saved Olit visualization", () => {
  it("is created as the olit type and never shared", async () => {
    const { rows, fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    const id = await savedSessions(connectGalaxy({ root: "http://galaxy/" })).save(document());
    const row = rows.get(id)! as any;
    expect(row.type).toBe(PLUGIN_TYPE);
    for (const key of ["importable", "published", "slug", "users_shared_with"]) {
      expect(row).not.toHaveProperty(key);
    }
    vi.unstubAllGlobals();
  });

  it("reads back what was saved", async () => {
    const { fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    const saved = savedSessions(connectGalaxy({ root: "http://galaxy/" }));
    const id = await saved.save(document());
    expect(await saved.load(id)).toEqual(document());
    vi.unstubAllGlobals();
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
    expect(title(document({ title: "x" })).length).toBeGreaterThanOrEqual(3);
  });

  it("keeps a name the user gave it", () => {
    expect(title(document({ title: "Rabies dating run" }))).toBe("Rabies dating run");
  });

  it("surfaces a failed save instead of pretending it worked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    await expect(
      savedSessions(connectGalaxy({ root: "http://galaxy/" })).save(document()),
    ).rejects.toThrow(/500/);
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
