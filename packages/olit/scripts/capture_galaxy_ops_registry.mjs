// Refresh the galaxy-ops browser registry the delegation test compares against.
//
// The brain cannot import a TypeScript module, so the set of operations the browser build
// registers is captured here instead. Run it after installing a new galaxy-ops; the diff
// shows what upstream added or withdrew rather than leaving it to an eval months later.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { allOperations } from "@galaxyproject/galaxy-ops/browser";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../brain/tests/data/galaxy-ops-browser.json");
const names = allOperations.map((op) => op.name).sort();
writeFileSync(out, JSON.stringify(names, null, 2) + "\n");
console.log(`${names.length} operations -> ${out}`);
