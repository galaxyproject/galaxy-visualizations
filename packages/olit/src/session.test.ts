import { describe, expect, it } from "vitest";
import { SessionStore, type Store } from "./session";
import { advance, newDocument, type SessionDocument } from "./session-document";

const HISTORY = "f2db41e1fa331b3e";
const USER = "u1";

function memoryStore(
  seed: Record<string, unknown> = {},
): Store & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...seed };
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

const turn = (d: SessionDocument, text: string) =>
  advance(d, { messages: [{ role: "user", content: text }], artifacts: [] });

const started = () => turn(newDocument({ historyId: HISTORY }), "run fastqc");

describe("SessionStore", () => {
  it("keys a session by its own id, not by the history it runs against", async () => {
    const store = memoryStore();
    const doc = started();
    await new SessionStore(store, USER).save(doc);

    expect(Object.keys(store.data)).toContain(`session:${USER}:${doc.session.id}`);
  });

  it("keeps several sessions on one history side by side", async () => {
    const store = memoryStore();
    const session = new SessionStore(store, USER);
    const first = started();
    const second = started();

    await session.save(first);
    await session.save(second);

    expect(await session.load(first.session.id)).toEqual(first);
    expect(await session.load(second.session.id)).toEqual(second);
  });

  it("points a history at the session last worked on there", async () => {
    const store = memoryStore();
    const session = new SessionStore(store, USER);
    const first = started();
    const second = started();

    await session.save(first);
    await session.save(second);

    expect(await session.current(HISTORY)).toBe(second.session.id);
  });

  it("keeps users apart, so a shared browser profile does not leak a conversation", async () => {
    const store = memoryStore();
    const doc = started();
    await new SessionStore(store, USER).save(doc);

    expect(await new SessionStore(store, "u2").load(doc.session.id)).toBeNull();
  });

  it("falls back to an anonymous scope when Galaxy reports no user", async () => {
    const store = memoryStore();
    const doc = started();
    await new SessionStore(store).save(doc);

    expect(Object.keys(store.data)).toContain(`session:anon:${doc.session.id}`);
  });

  it("does nothing when the browser has no IndexedDB", async () => {
    const session = new SessionStore(null, USER);
    expect(session.enabled).toBe(false);
    await expect(session.save(started())).resolves.toBeUndefined();
    expect(await session.load("anything")).toBeNull();
  });

  it("ignores stored junk rather than feeding it to the model", async () => {
    const store = memoryStore({ [`session:${USER}:s1`]: { messages: ["nonsense"] } });
    expect(await new SessionStore(store, USER).load("s1")).toBeNull();
  });

  it("survives a storage failure without breaking the turn", async () => {
    const broken: Store = {
      async get() {
        throw new Error("quota");
      },
      async put() {
        throw new Error("quota");
      },
      async remove() {
        throw new Error("quota");
      },
    };
    const session = new SessionStore(broken, USER);
    await expect(session.save(started())).resolves.toBeUndefined();
    expect(await session.load("s1")).toBeNull();
  });

  it("forgets the local copy without touching anything saved on Galaxy", async () => {
    const store = memoryStore();
    const session = new SessionStore(store, USER);
    const doc = started();
    await session.save(doc);

    await session.forget(doc);

    expect(await session.load(doc.session.id)).toBeNull();
    expect(await session.current(HISTORY)).toBeUndefined();
  });
});
