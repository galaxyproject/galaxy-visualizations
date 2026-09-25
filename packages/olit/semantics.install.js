#!/usr/bin/env node
/**
 * Put galaxy-agent-semantics where the worker can micropip-install it offline.
 *
 * The pure tool- and workflow-input contracts are galaxy-mcp's own implementation, consumed
 * as a package rather than copied: one implementation, two deliveries. The wheel is served
 * from the plugin's own assets like the brain wheel, so nothing reaches PyPI at run time.
 *
 * The wheel is content-stamped for the same reason the brain wheel is: during development
 * its version does not move while its contents do, and a browser that cached one URL would
 * keep serving a stale copy.
 *
 * Point GALAXY_AGENT_SEMANTICS_DIR at a checkout to build from source; without it, a wheel
 * already staged under static/pyodide is kept, which is what CI and a plain build use.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// static/pyodide is what the browser loads; temp/pyodide is the cache vite's static-copy
// repopulates it from on a production build, so the wheel has to be in both.
const DESTS = [join(HERE, "static", "pyodide"), join(HERE, "temp", "pyodide")];
const PREFIX = "galaxy_agent_semantics-";
const STAMPED = /^galaxy_agent_semantics-.*-0[0-9a-f]{12}-py3-none-any\.whl$/;

function staged() {
  const dir = DESTS[0];
  if (!existsSync(dir)) return null;
  return readdirSync(dir).find((f) => f.startsWith(PREFIX) && f.endsWith(".whl")) || null;
}

/** Build a wheel from a checkout, reproducibly, so identical sources stamp identically. */
function build(source) {
  const dist = join(source, "dist");
  rmSync(dist, { recursive: true, force: true });
  execFileSync("python3", ["-m", "build", "--wheel"], {
    cwd: source,
    stdio: "inherit",
    env: { ...process.env, SOURCE_DATE_EPOCH: "315532800" },
  });
  const built = readdirSync(dist).filter((f) => f.startsWith(PREFIX) && f.endsWith(".whl"));
  if (built.length !== 1) {
    throw new Error(`Expected one semantics wheel under ${dist}, found ${built.length}.`);
  }
  return join(dist, built[0]);
}

function stamp(name, bytes) {
  if (STAMPED.test(name)) return name;
  const tag = `0${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}`;
  // galaxy_agent_semantics-<version>-<tag>-py3-none-any.whl
  return name.replace(/^(galaxy_agent_semantics-[^-]+)-/, `$1-${tag}-`);
}

function main() {
  const source = process.env.GALAXY_AGENT_SEMANTICS_DIR;
  if (!source) {
    const existing = staged();
    if (!existing) {
      throw new Error(
        "No semantics wheel under static/pyodide. Set GALAXY_AGENT_SEMANTICS_DIR to a " +
          "galaxy-agent-semantics checkout to build one.",
      );
    }
    console.log(`semantics wheel already staged: ${existing}`);
    return;
  }
  const wheel = build(source);
  const bytes = readFileSync(wheel);
  const name = stamp(wheel.split("/").pop(), bytes);
  for (const dest of DESTS) {
    mkdirSync(dest, { recursive: true });
    for (const old of readdirSync(dest).filter((f) => f.startsWith(PREFIX))) {
      rmSync(join(dest, old));
    }
    writeFileSync(join(dest, name), bytes);
  }
  console.log(`semantics wheel staged: ${name}`);
}

main();
