/**
 * Report where olit's pinned upstreams sit relative to their sources.
 *
 * Reports, never updates: the pins are the contract, and a corpus that followed `main`
 * would change agent behaviour without a commit saying so. Exits 0 even when behind, so
 * this can run in CI as information rather than as a gate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const read = (p) =>
  JSON.parse(readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), p), "utf8"));

/** The version spec `package.json` pins `name` to, wherever it declares it. */
export function pinned(pkg, name) {
  const spec = pkg.devDependencies?.[name] ?? pkg.dependencies?.[name];
  if (!spec) throw new Error(`package.json pins no ${name}`);
  return spec;
}

async function github(path) {
  const headers = { "User-Agent": "olit-stale-check", Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res.json();
}

async function skills() {
  const lock = read("skills.lock.json");
  const head = await github(`repos/${lock.repo}/commits/${lock.ref || "main"}`);
  if (head.sha === lock.sha) {
    return `skills     up to date at ${lock.sha.slice(0, 8)} (${lock.repo}@${lock.ref})`;
  }
  const cmp = await github(`repos/${lock.repo}/compare/${lock.sha}...${head.sha}`);
  const touched = (cmp.files || []).filter((f) => f.filename.startsWith("skills/")).length;
  return (
    `skills     BEHIND by ${cmp.total_commits} commit(s): ${lock.sha.slice(0, 8)} -> ${head.sha.slice(0, 8)}\n` +
    `           ${touched} file(s) changed under skills/, the subtree olit vendors\n` +
    `           update: edit skills.lock.json, node scripts/install_skills.js`
  );
}

async function npmLatest(pkg) {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
  if (!res.ok) throw new Error(`npm ${res.status} for ${pkg}`);
  return (await res.json()).version;
}

/** A pin to a release asset rather than a version: a temporary candidate build of galaxy-ops. */
const ARTIFACT = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\//;

async function galaxyOps() {
  const spec = pinned(read("package.json"), "@galaxyproject/galaxy-ops");
  const latest = await npmLatest("@galaxyproject/galaxy-ops");
  const artifact = ARTIFACT.exec(spec);
  if (artifact) {
    const built =
      read("package-lock.json").packages["node_modules/@galaxyproject/galaxy-ops"].version;
    return (
      `galaxy-ops TEMPORARY: pinned to candidate ${built} (${artifact[1]} release ${artifact[2]}); npm has ${latest}\n` +
      `           replace it with the first npm release that contains it: npm install @galaxyproject/galaxy-ops@<version>, then npm test`
    );
  }
  const version = spec.replace(/^[\^~]/, "");
  return version === latest
    ? `galaxy-ops up to date at ${version}`
    : `galaxy-ops BEHIND: package.json wants ${version}, npm has ${latest}\n` +
        `           update: bump it and run npm test; ops.ts runs its operations directly`;
}

async function galaxyCharts() {
  const version = pinned(read("package.json"), "galaxy-charts").replace(/^[\^~]/, "");
  const latest = await npmLatest("galaxy-charts");
  return version === latest
    ? `charts     up to date at ${version}`
    : `charts     BEHIND: package.json wants ${version}, npm has ${latest}\n` +
        `           update: bump it and run npm test; visualizations.ts imports its input contract directly`;
}

/** GitHub's compare lists at most this many files, so a longer list may be missing some. */
const COMPARE_FILE_CAP = 300;

async function orbit() {
  const manifest = read("src/orbit/MANIFEST.json");
  const head = await github(`repos/${manifest.upstream}/commits/main`);
  const pinned = manifest.commit.slice(0, 8);
  if (head.sha === manifest.commit) {
    return `orbit ui   up to date at ${pinned} (${manifest.upstream}@main)`;
  }
  const watched = new Set(Object.keys(manifest.files));
  const cmp = await github(`repos/${manifest.upstream}/compare/${manifest.commit}...${head.sha}`);
  const files = cmp.files || [];
  const touched = files.map((f) => f.filename).filter((name) => watched.has(name));
  const update = "           update: npm run sync:orbit -- <path to a loom checkout at main>";
  if (touched.length) {
    return (
      `orbit ui   BEHIND: ${touched.length} vendored file(s) changed in loom since ${pinned}: ${touched.join(", ")}\n` +
      update
    );
  }
  if (files.length >= COMPARE_FILE_CAP) {
    return (
      `orbit ui   UNKNOWN: loom changed ${files.length}+ files since ${pinned}, more than GitHub lists;\n` +
      `           compare src/orbit with loom by hand`
    );
  }
  return `orbit ui   up to date: loom is ${cmp.total_commits} commit(s) past ${pinned}, none touching the vendored files`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const results = await Promise.allSettled([skills(), galaxyOps(), galaxyCharts(), orbit()]);
  for (const r of results) {
    console.log(r.status === "fulfilled" ? r.value : `(could not check: ${r.reason.message})`);
  }
}
