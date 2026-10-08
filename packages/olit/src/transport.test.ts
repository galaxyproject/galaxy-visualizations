/**
 * Galaxy is reached through one transport, the page's requests and the agent's alike: the
 * user's session or key, no cached answer, a refused request resent while that is safe, ids
 * kept to one path segment. The page once made its own Galaxy requests beside it, without any
 * of that. A `fetch` anywhere else has to say what it reaches instead.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname);
const SKIPPED = ["orbit/", "agent/skills/"];

/** Every direct `fetch(` call that is not Galaxy, and what it reaches. */
const NOT_GALAXY: Record<string, string> = {
  "agent/galaxy.ts": "the transport itself, for Galaxy and, as a tool call's `web`, other hosts",
  "agent/python.ts": "Pyodide's own static files for the realm, without credentials",
  "agent/providers.ts": "a local model server's /props",
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : [path];
  });
}

describe("the Galaxy transport", () => {
  it("is the only way the page or the agent fetches from Galaxy", () => {
    const fetching = sources(ROOT)
      .map((path) => relative(ROOT, path))
      .filter((rel) => /\.(ts|js)$/.test(rel) && !rel.endsWith(".test.ts"))
      .filter((rel) => !SKIPPED.some((s) => rel.startsWith(s)))
      .filter((rel) => /(^|[^\w.])fetch\(/m.test(readFileSync(join(ROOT, rel), "utf8")))
      .sort();
    expect(fetching).toEqual(Object.keys(NOT_GALAXY).sort());
  });

  it("is built only where Galaxy's own clients are, so other hosts go through a call's `web`", () => {
    const building = sources(ROOT)
      .map((path) => relative(ROOT, path))
      .filter((rel) => /\.(ts|js)$/.test(rel) && !rel.endsWith(".test.ts"))
      .filter((rel) => !SKIPPED.some((s) => rel.startsWith(s)))
      .filter((rel) => /connectGalaxy\(/.test(readFileSync(join(ROOT, rel), "utf8")))
      .sort();
    expect(building).toEqual(["agent/galaxy.ts", "agent/runtime.ts", "agent/worker.ts", "main.ts"]);
  });
});
