import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error a plain node script, without types
import { pinned } from "../scripts/check_stale.js";

const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

describe("npm run stale", () => {
  it("finds every pin it reports on in package.json", () => {
    for (const name of ["@galaxyproject/galaxy-ops", "galaxy-charts"]) {
      expect(pinned(pkg, name)).toBeTruthy();
    }
  });
});
