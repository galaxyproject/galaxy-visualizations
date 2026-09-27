import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  catalogFailed,
  catalogRefusalMessage,
  galaxyCanRun,
  galaxyPartialWarning,
  galaxyRefusalMessage,
  type GalaxyStatus,
} from "./diagnostics";

const BRAIN = resolve(__dirname, "../brain");

/** Produced by the brain, so the shell cannot disagree with the prompt about the same state. */
function samples(script: string): Record<string, any> {
  const out = execFileSync("python3", [`tests/${script}`], {
    cwd: BRAIN,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

const galaxy = samples("galaxy_status_samples.py");
const catalog = samples("catalog_status_samples.py");

describe("the approval gate and the prompt, on the same Galaxy state", () => {
  it("covers every state the brain can report", () => {
    expect(Object.keys(galaxy).sort()).toEqual(["ok", "ops-unavailable", "unreachable"]);
  });

  it.each(Object.values(galaxy))(
    "refuses exactly when the prompt says nothing can run: %o",
    (state) => {
      // The one guard against the contradiction that shipped: the prompt told the model Galaxy was
      // ready while Approve told the user nothing in the plan could run.
      expect(galaxyCanRun(state.status as GalaxyStatus)).toBe(!state.says_nothing_can_run);
    },
  );

  it.each(Object.values(galaxy))(
    "warns exactly when the prompt says partly available: %o",
    (state) => {
      expect(galaxyPartialWarning(state.status as GalaxyStatus) !== null).toBe(
        state.says_partly_available,
      );
    },
  );

  it("does not block before the brain has reported", () => {
    expect(galaxyCanRun(undefined)).toBe(true);
    expect(galaxyCanRun(null)).toBe(true);
    expect(galaxyPartialWarning(undefined)).toBeNull();
  });

  it("names the server rather than the catalog when it refuses", () => {
    expect(galaxyRefusalMessage()).toMatch(/Galaxy did not answer/);
    expect(galaxyRefusalMessage()).not.toMatch(/catalog/i);
  });
});

describe("the catalog, which no longer takes part in the gate", () => {
  it("does not refuse a plan in either of its states", () => {
    // It gates lineage_report, organize_datasets and charting; no Galaxy tool reads it.
    for (const state of ["lazy", "failed"]) {
      expect(galaxyCanRun(galaxy.ok.status as GalaxyStatus), state).toBe(true);
    }
  });

  it("tells a catalog nothing asked for from one that failed", () => {
    expect(catalog.lazy.asked).toBe(false);
    expect(catalogFailed(catalog.lazy)).toBe(false);
    expect(catalog.failed.asked).toBe(true);
    expect(catalogFailed(catalog.failed)).toBe(true);
  });

  it("says which tools a failed catalog costs, and that the rest are unaffected", () => {
    const message = catalogRefusalMessage(catalog.failed);
    expect(message).toContain(catalog.failed.error);
    expect(message).toMatch(/lineage_report/);
    expect(message).toMatch(/every other Galaxy tool is unaffected/);
  });
});
