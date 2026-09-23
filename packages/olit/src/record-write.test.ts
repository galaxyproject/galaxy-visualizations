import { afterEach, describe, expect, it, vi } from "vitest";

import { editRecord } from "./record-write";
import { writeSessionSummary } from "./session-summary";

afterEach(() => vi.unstubAllGlobals());

const TARGET = { root: "/", credentials: "include" as RequestCredentials, historyId: "h1" };
const RECORD = { id: "p1", slug: "olit-h1" };

/** A Galaxy whose page holds `source`, recording every write it receives. */
function galaxy(page: Record<string, unknown>, putOk = true) {
    const writes: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
            writes.push(JSON.parse(String(init.body)).content);
            return { ok: putOk, json: async () => ({}) };
        }
        if (url.includes("api/pages?")) {
            return { ok: true, json: async () => [RECORD] };
        }
        return { ok: true, json: async () => page };
    });
    return writes;
}

describe("editRecord", () => {
    it("edits the editable source, never the embed-expanded render", async () => {
        // Galaxy returns the directive in content_editor and its expansion in content;
        // writing the render back would replace the directive with a one-time value.
        const writes = galaxy({
            content_editor: "${galaxy history_dataset_name(history_dataset_id=d1)}",
            content: "tracks.bed",
        });
        expect(await editRecord(TARGET, (c) => `${c}\nmore`)).toBe(true);
        expect(writes).toEqual(["${galaxy history_dataset_name(history_dataset_id=d1)}\nmore"]);
    });

    it("falls back to content when the page has no editable source", async () => {
        const writes = galaxy({ content: "# Notebook" });
        await editRecord(TARGET, (c) => `${c}\nmore`);
        expect(writes).toEqual(["# Notebook\nmore"]);
    });

    it("hands the edit the record's id", async () => {
        const writes = galaxy({ content_editor: "" });
        await editRecord(TARGET, (_c, id) => `record: ${id}`);
        expect(writes).toEqual(["record: p1"]);
    });

    it("writes nothing when the edit changes nothing", async () => {
        const writes = galaxy({ content_editor: "# Notebook" });
        expect(await editRecord(TARGET, (c) => c)).toBe(true);
        expect(writes).toEqual([]);
    });

    it("reports failure once the attempts are spent", async () => {
        const writes = galaxy({ content_editor: "# Notebook" }, false);
        expect(await editRecord(TARGET, (c) => `${c}!`)).toBe(false);
        expect(writes).toHaveLength(3);
    });
});

describe("concurrent record writers", () => {
    it("keeps both edits when two writers do not await each other", async () => {
        // Galaxy's page PUT has no concurrency check, so interleaved reads lose an update.
        let stored = "# Notebook";
        // Both round trips take a tick, as a real one does: that is the window a second
        // writer reads in, and it is why the two edits have to be kept apart.
        const roundTrip = () => new Promise((r) => setTimeout(r, 0));
        vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
            if (init?.method === "PUT") {
                const written = JSON.parse(String(init.body)).content;
                await roundTrip();
                stored = written;
                return { ok: true, json: async () => ({}) };
            }
            if (url.includes("api/pages?")) {
                return { ok: true, json: async () => [RECORD] };
            }
            await roundTrip();
            return { ok: true, json: async () => ({ content_editor: stored }) };
        });

        await Promise.all([
            editRecord(TARGET, (c) => `${c}\njob submitted`),
            editRecord(TARGET, (c) => `${c}\njob settled`),
        ]);
        expect(stored).toContain("job submitted");
        expect(stored).toContain("job settled");
    });
});

describe("writeSessionSummary", () => {
    it("appends its block to the editable source", async () => {
        const writes = galaxy({
            content_editor: "${galaxy history_dataset_name(history_dataset_id=d1)}",
            content: "tracks.bed",
        });
        await writeSessionSummary("/", "include", "h1", {
            id: "s1", startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z",
            orphanedActiveSteps: 0,
        });
        expect(writes[0]).toContain("${galaxy history_dataset_name(history_dataset_id=d1)}");
        expect(writes[0]).toContain("```olit-session");
        expect(writes[0]).toContain("record: p1");
    });

    it("does nothing without a history to key on", async () => {
        const writes = galaxy({ content_editor: "" });
        expect(
            await writeSessionSummary("/", "include", undefined, {
                id: "s1", startedAt: "a", endedAt: "b", orphanedActiveSteps: 0,
            }),
        ).toBe(false);
        expect(writes).toEqual([]);
    });
});
