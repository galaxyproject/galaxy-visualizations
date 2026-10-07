/**
 * Copy the vendored Orbit UI from a loom checkout, exactly as loom has it, and re-pin it.
 *
 *   npm run sync:orbit -- <path to a loom checkout>
 *
 * The files are the ones src/orbit/MANIFEST.json lists, under the paths they have in loom, so
 * they stay byte-identical and their relative imports resolve as they do there. The manifest then
 * records the checkout's commit and each file's sha256, which check_vendored.py verifies and
 * check_stale.js compares with loom's main. A relative import that leaves the listed files stops
 * the sync: add the file it names to the manifest and run it again.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, posix } from "node:path";

const VENDORED = join(process.cwd(), "src", "orbit");
const MANIFEST = join(VENDORED, "MANIFEST.json");

const loom = process.argv[2];
if (!loom || !existsSync(join(loom, ".git"))) {
  console.error("usage: npm run sync:orbit -- <path to a loom checkout>");
  process.exit(2);
}
const git = (...args) => execFileSync("git", ["-C", loom, ...args], { encoding: "utf8" }).trim();

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const paths = Object.keys(manifest.files);

// The commit recorded has to be what was copied.
const dirty = git("status", "--porcelain", "--", ...paths);
if (dirty) {
  console.error(`the loom checkout has uncommitted changes to vendored files:\n${dirty}`);
  process.exit(1);
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const changed = [];
for (const path of paths) {
  const from = join(loom, path);
  if (!existsSync(from)) {
    console.error(`loom has no ${path}; take it out of the manifest if loom removed it`);
    process.exit(1);
  }
  const to = join(VENDORED, path);
  if (!existsSync(to) || sha256(from) !== sha256(to)) changed.push(path);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

/** Relative specifiers a vendored file imports, as written. */
function relativeImports(path) {
  const text = readFileSync(join(VENDORED, path), "utf8");
  const pattern = path.endsWith(".css")
    ? /@import\s+url\(\s*["']?(\.{1,2}\/[^"')]+)["']?\s*\)/g
    : /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;
  return [...text.matchAll(pattern)].map((m) => m[1]);
}

const listed = new Set(paths);
const unlisted = [];
for (const path of paths.filter((p) => /\.(ts|js|css)$/.test(p) && !p.endsWith(".d.ts"))) {
  for (const specifier of relativeImports(path)) {
    const target = normalize(posix.join(posix.dirname(path), specifier));
    const candidates = [target, target.replace(/\.js$/, ".ts")];
    if (!candidates.some((c) => listed.has(c))) unlisted.push(`${path} imports ${target}`);
  }
}

manifest.commit = git("rev-parse", "HEAD");
manifest.files = Object.fromEntries(paths.map((p) => [p, sha256(join(VENDORED, p))]));
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `synced ${paths.length} files from loom ${manifest.commit.slice(0, 8)}; ` +
    (changed.length ? `changed: ${changed.join(", ")}` : "none changed"),
);
if (unlisted.length) {
  console.error(
    `\nimports outside the vendored files -- add them to the manifest:\n  ${unlisted.join("\n  ")}`,
  );
  process.exit(1);
}
