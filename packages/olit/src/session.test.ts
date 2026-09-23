import { describe, expect, it } from "vitest";
import { SessionMemory, type Store } from "./session";

const HISTORY = "f2db41e1fa331b3e";

function memoryStore(seed: Record<string, unknown> = {}): Store & { data: Record<string, unknown> } {
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

const CONVO = [
    { role: "system", content: "identity" },
    { role: "user", content: "run fastqc" },
    { role: "assistant", content: "on it" },
];

const USER = "u1";

describe("SessionMemory", () => {
    it("keys the conversation by user and history, as pi keys by home plus directory", async () => {
        const store = memoryStore();

        await new SessionMemory(store, HISTORY, USER).save(CONVO);

        expect(Object.keys(store.data)).toEqual([`session:${USER}:${HISTORY}`]);
    });

    it("keeps users apart, so a shared browser profile does not leak a conversation", async () => {
        const store = memoryStore();
        await new SessionMemory(store, HISTORY, USER).save(CONVO);

        expect(await new SessionMemory(store, HISTORY, "someone-else").load()).toBeNull();
        expect(await new SessionMemory(store, HISTORY, USER).load()).toEqual(CONVO);
    });

    it("falls back to an anonymous scope when Galaxy reports no user", async () => {
        const store = memoryStore();

        await new SessionMemory(store, HISTORY).save(CONVO);

        expect(Object.keys(store.data)).toEqual([`session:anon:${HISTORY}`]);
    });

    it("restores what it stored", async () => {
        const store = memoryStore();
        await new SessionMemory(store, HISTORY).save(CONVO);

        expect(await new SessionMemory(store, HISTORY).load()).toEqual(CONVO);
    });

    it("keeps histories apart, so a different analysis starts fresh", async () => {
        const store = memoryStore();
        await new SessionMemory(store, HISTORY).save(CONVO);

        expect(await new SessionMemory(store, "other").load()).toBeNull();
    });

    it("does nothing without a history to key on", async () => {
        const store = memoryStore();
        const session = new SessionMemory(store, undefined);

        expect(session.enabled).toBe(false);
        await session.save(CONVO);
        expect(store.data).toEqual({});
        expect(await session.load()).toBeNull();
    });

    it("does nothing when the browser has no IndexedDB", async () => {
        const session = new SessionMemory(null, HISTORY);

        expect(session.enabled).toBe(false);
        await session.save(CONVO);
        expect(await session.load()).toBeNull();
    });

    it("does not store a seeded prompt with no conversation behind it", async () => {
        const store = memoryStore();

        await new SessionMemory(store, HISTORY).save([{ role: "system", content: "identity" }]);

        expect(store.data).toEqual({});
    });

    it("clears on reset", async () => {
        const store = memoryStore();
        const session = new SessionMemory(store, HISTORY);
        await session.save(CONVO);

        await session.clear();

        expect(await session.load()).toBeNull();
    });

    it("ignores stored junk rather than feeding it to the model", async () => {
        const store = memoryStore({ [`session:${HISTORY}`]: ["not a message"] });

        expect(await new SessionMemory(store, HISTORY).load()).toBeNull();
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
        const session = new SessionMemory(broken, HISTORY);

        await expect(session.save(CONVO)).resolves.toBeUndefined();
        await expect(session.load()).resolves.toBeNull();
        await expect(session.clear()).resolves.toBeUndefined();
    });
});
