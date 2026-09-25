#!/usr/bin/env node
/**
 * Bundle galaxy-ops and the executor into one module the Pyodide worker can import.
 *
 * The worker is copied rather than bundled -- it is loaded from a URL string, so vite never
 * sees it -- which is why this cannot be a bare import inside the worker. It is served beside
 * the worker and imported from there at startup.
 *
 * Content-stamped for the reason the brain wheel is: the name has to change when the contents
 * do, or a browser keeps serving the module it already has.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESTS = [join(HERE, "static", "pyodide"), join(HERE, "temp", "pyodide")];
const PREFIX = "galaxy-ops-";

const bundled = await build({
  configFile: false,
  logLevel: "warn",
  build: {
    write: false,
    target: "es2022",
    lib: { entry: join(HERE, "src", "pyodide", "galaxy-ops-executor.js"), formats: ["es"] },
  },
});
const [{ output }] = [].concat(bundled);
const code = output.find((chunk) => chunk.type === "chunk").code;
const tag = createHash("sha256").update(code).digest("hex").slice(0, 12);
const name = `${PREFIX}${tag}.js`;

for (const dest of DESTS) {
  mkdirSync(dest, { recursive: true });
  for (const old of readdirSync(dest).filter((f) => f.startsWith(PREFIX))) rmSync(join(dest, old));
  writeFileSync(join(dest, name), code);
}
console.log(`galaxy-ops module staged: ${name} (${(code.length / 1024).toFixed(0)} KB)`);
