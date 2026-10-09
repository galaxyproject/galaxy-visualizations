import { afterEach, describe, expect, it, vi } from "vitest";
import { visualizationStore } from "./agent/fake-model";
import { connectGalaxy } from "./agent/galaxy";
import { SCHEMA, title, type SessionDocument } from "./agent/saved";
import { NotYours, PLUGIN_TYPE, reportSavedState, savedSessions } from "./saved-session";

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

const ME = "f2db41e1fa331b3e";

/** A Galaxy that keeps visualizations in memory, each owned by the user who saved it. */
function fakeGalaxy(me: string | null = ME) {
  const { rows, answer } = visualizationStore(me);
  const fetchMock = vi.fn(async (request: Request) => (await answer(request))!);
  return { rows, fetchMock };
}

describe("a saved Olit visualization", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is created as the olit type and never shared", async () => {
    const { rows, fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    const id = await savedSessions(connectGalaxy({ root: "http://galaxy/" })).save(document());
    const row = rows.get(id)! as any;
    expect(row.type).toBe(PLUGIN_TYPE);
    for (const key of ["importable", "published", "slug", "users_shared_with"]) {
      expect(row).not.toHaveProperty(key);
    }
  });

  it("reads back what was saved", async () => {
    const { fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    const saved = savedSessions(connectGalaxy({ root: "http://galaxy/" }));
    const id = await saved.save(document());
    expect(await saved.load(id)).toEqual(document());
  });

  it.each([
    ["shared with this user, or open to anyone with the link", "0a248a1f62a0cc04"],
    ["saved with no owner Galaxy reports", undefined],
  ])("refuses a session %s, before reading it", async (_, owner) => {
    const { rows, fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    rows.set("v9", { title: "theirs", config: document(), owner });
    await expect(
      savedSessions(connectGalaxy({ root: "http://galaxy/" })).load("v9"),
    ).rejects.toThrow(NotYours);
  });

  it("refuses every session to a user who is not signed in", async () => {
    const { rows, fetchMock } = fakeGalaxy(null);
    vi.stubGlobal("fetch", fetchMock);
    rows.set("v9", { title: "theirs", config: document(), owner: ME });
    await expect(
      savedSessions(connectGalaxy({ root: "http://galaxy/" })).load("v9"),
    ).rejects.toThrow(NotYours);
  });

  it("refuses a visualization that is not an Olit session", async () => {
    const { rows, fetchMock } = fakeGalaxy();
    vi.stubGlobal("fetch", fetchMock);
    rows.set("v1", { title: "chart", config: { settings: {}, tracks: [] }, owner: ME });
    expect(await savedSessions(connectGalaxy({ root: "http://galaxy/" })).load("v1")).toBeNull();
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
