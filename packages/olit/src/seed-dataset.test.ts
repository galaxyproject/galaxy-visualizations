import { afterEach, describe, expect, it, vi } from "vitest";

import { connectGalaxy } from "./agent/galaxy";
import { resolveLaunch, summarize } from "./seed-dataset";

const galaxy = connectGalaxy({ root: "http://galaxy/" });

afterEach(() => vi.unstubAllGlobals());

describe("resolveLaunch", () => {
  /** Galaxy answering `routes`, by path, and recording what was asked. */
  function routes(answers: Record<string, unknown>) {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname.slice(1);
      asked.push(path);
      return path in answers
        ? new Response(JSON.stringify(answers[path]), { status: 200 })
        : new Response("not found", { status: 404 });
    });
    return asked;
  }

  it("takes the conversation's history from the dataset Galaxy launched olit on", async () => {
    routes({
      "api/datasets/d1": {
        name: "health.csv",
        extension: "csv",
        state: "ok",
        misc_blurb: "8 lines",
        history_id: "h1",
      },
    });
    expect(await resolveLaunch(galaxy, "d1")).toEqual({
      historyId: "h1",
      dataset: { name: "health.csv", extension: "csv", state: "ok", blurb: "8 lines" },
    });
  });

  it("falls back to Galaxy's current history when launched without a dataset", async () => {
    const asked = routes({ "history/current_history_json": { id: "h9" } });
    expect(await resolveLaunch(galaxy)).toEqual({ historyId: "h9" });
    expect(asked).toEqual(["history/current_history_json"]);
  });

  it("says why when Galaxy refuses the dataset, rather than starting unbound in silence", async () => {
    routes({});
    const launch = await resolveLaunch(galaxy, "d1");
    expect(launch.historyId).toBeUndefined();
    expect(launch.problem).toContain("404");
  });

  it("says why when the request fails", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect((await resolveLaunch(galaxy, "d1")).problem).toContain("offline");
  });
});

describe("summarize", () => {
  it("names the dataset and asks what to do with it", () => {
    const line = summarize({ name: "health.csv", extension: "csv", state: "ok", blurb: "8 lines" });
    expect(line).toBe(
      "Starting from health.csv (csv, 8 lines). What would you like to do with it?",
    );
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
