import { afterEach, describe, expect, it, vi } from "vitest";

import { describeSeedDataset, summarize } from "./seed-dataset";

afterEach(() => vi.unstubAllGlobals());

const serve = (body: unknown, ok = true) =>
    vi.stubGlobal("fetch", async () => ({ ok, json: async () => body }));

describe("describeSeedDataset", () => {
    it("reads the dataset Galaxy opened olite on", async () => {
        serve({ name: "health.csv", extension: "csv", state: "ok", misc_blurb: "8 lines" });
        expect(await describeSeedDataset("/", "include", "d1")).toEqual({
            name: "health.csv", extension: "csv", state: "ok", blurb: "8 lines",
        });
    });

    it("says nothing when Galaxy refuses the dataset", async () => {
        serve({}, false);
        expect(await describeSeedDataset("/", "include", "d1")).toBeNull();
    });

    it("says nothing rather than throwing when the request fails", async () => {
        vi.stubGlobal("fetch", async () => {
            throw new Error("offline");
        });
        expect(await describeSeedDataset("/", "include", "d1")).toBeNull();
    });

    it("says nothing when the response is not a dataset", async () => {
        serve({ err_msg: "not found" });
        expect(await describeSeedDataset("/", "include", "d1")).toBeNull();
    });
});

describe("summarize", () => {
    it("names the dataset and asks what to do with it", () => {
        const line = summarize({ name: "health.csv", extension: "csv", state: "ok", blurb: "8 lines" });
        expect(line).toBe("Starting from health.csv (csv, 8 lines). What would you like to do with it?");
    });

    it("surfaces a state that is not ok, and stays quiet about one that is", () => {
        expect(summarize({ name: "r.bam", extension: "bam", state: "error" })).toContain("error");
        expect(summarize({ name: "r.bam", extension: "bam", state: "ok" })).not.toContain("ok)");
    });

    it("falls back to the name alone when Galaxy offered nothing else", () => {
        expect(summarize({ name: "peptide.pdb" })).toBe(
            "Starting from peptide.pdb. What would you like to do with it?",
        );
    });
});
