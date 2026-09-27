import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogFailed, catalogRefusalMessage, galaxyCanRun } from "./catalog-gate";

/** The two states the brain really reports, produced by the brain that reports them. */
function states(): Record<string, any> {
  const out = execFileSync("python3", ["tests/catalog_status_samples.py"], {
    cwd: resolve(__dirname, "../brain"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

const real = states();

describe("the catalog states the brain reports", () => {
  it("tells a catalog nothing asked for from one that failed", () => {
    // Only the graph route loads it, so not-asked is the normal state of a session that
    // never took that route -- and every Galaxy tool runs without it.
    expect(real.lazy.asked).toBe(false);
    expect(real.lazy.error).toBeNull();
    expect(catalogFailed(real.lazy)).toBe(false);
    expect(galaxyCanRun(real.lazy)).toBe(true);
  });

  it("refuses once the catalog has been asked for and could not answer", () => {
    expect(real.failed.asked).toBe(true);
    expect(real.failed.error).toBeTruthy();
    expect(catalogFailed(real.failed)).toBe(true);
    expect(galaxyCanRun(real.failed)).toBe(false);
    expect(catalogRefusalMessage(real.failed)).toContain(real.failed.error);
  });
});

describe("galaxyCanRun", () => {
  it("allows execution when the catalog loaded with operations", () => {
    expect(galaxyCanRun({ loaded: true, op_count: 44 })).toBe(true);
  });

  it("refuses when the catalog failed to load", () => {
    expect(galaxyCanRun({ loaded: false, op_count: 0, error: "404" })).toBe(false);
  });

  it("refuses a catalog that loaded but exposes nothing", () => {
    expect(galaxyCanRun({ loaded: true, op_count: 0 })).toBe(false);
  });

  it("does not block before the brain has reported", () => {
    // Absence of evidence is not evidence of a broken catalog; the first turn has
    // no diagnostics yet and must not be refused.
    expect(galaxyCanRun(undefined)).toBe(true);
    expect(galaxyCanRun(null)).toBe(true);
  });

  it("carries the catalog's own error into the refusal", () => {
    expect(catalogRefusalMessage({ loaded: false, error: "connection refused" })).toContain(
      "connection refused",
    );
  });
});
