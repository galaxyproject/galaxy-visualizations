/** The delegation split is checked against a snapshot of galaxy-ops; this holds the snapshot
 * to the package that is actually installed.
 *
 * `brain/tests/data/galaxy-ops-browser.json` is the list the Python suite compares its
 * delegated/kept split against, and the brain cannot import a TypeScript module to build it.
 * So it is a checked-in copy, and a fork release plus a forgotten capture would leave the
 * Python test green while Olit delegated a name the artifact no longer has. This is the same
 * lesson as `tool-result.boundary.test.ts`: cross the boundary rather than trust a fixture.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { allOperations } from "@galaxyproject/galaxy-ops/browser";

const SNAPSHOT = resolve(__dirname, "../brain/tests/data/galaxy-ops-browser.json");

describe("the galaxy-ops registry the brain compares against", () => {
  it("is the registry this build installs", () => {
    const installed = allOperations.map((op) => op.name).sort();
    const captured: string[] = JSON.parse(readFileSync(SNAPSHOT, "utf8"));

    expect(
      captured,
      "stale: re-run `npm run galaxy-ops-registry` after installing a new galaxy-ops",
    ).toEqual(installed);
  });
});
