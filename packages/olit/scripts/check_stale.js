/**
 * Report where olit's pinned upstreams sit relative to their sources.
 *
 * Reports, never updates: the pins are the contract, and a corpus that followed `main`
 * would change agent behaviour without a commit saying so. Exits 0 even when behind, so
 * this can run in CI as information rather than as a gate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

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
    `           update: edit skills.lock.json, node scripts/install_skills.js, python3 scripts/check_vendored.py --update`
  );
}

async function galaxyMcp() {
  const pinned = read("brain/tests/data/galaxy-mcp-docs.json").version;
  const res = await fetch("https://pypi.org/pypi/galaxy-mcp/json");
  if (!res.ok) throw new Error(`PyPI ${res.status}`);
  const latest = (await res.json()).info.version;
  if (pinned === latest) {
    return `galaxy-mcp up to date at ${pinned}`;
  }
  // A capture from a dev checkout is not behind a release; the two are not ordered.
  if (/\d(a|b|rc|\.dev)/.test(pinned)) {
    return (
      `galaxy-mcp captured from ${pinned}, an unreleased build; PyPI publishes ${latest}\n` +
      `           recapture from whichever galaxy-mcp olit is meant to follow: make galaxy-mcp-docs`
    );
  }
  return (
    `galaxy-mcp BEHIND: descriptions captured from ${pinned}, PyPI has ${latest}\n` +
    `           update: make galaxy-mcp-docs, then read the parity test's diff`
  );
}

async function npmLatest(pkg) {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
  if (!res.ok) throw new Error(`npm ${res.status} for ${pkg}`);
  return (await res.json()).version;
}

// The pin is a fork tarball, so "latest" upstream is not what olit runs. The useful question is
// whether upstream has absorbed enough of the fork delta for the fork to shrink.
async function galaxyOps() {
  const spec = read("package.json").dependencies["@galaxyproject/galaxy-ops"];
  const tag = (spec.match(/ops-v([\w.\-]+)\//) || [])[1] || spec;
  const upstream = await npmLatest("@galaxyproject/galaxy-ops");
  return (
    `galaxy-ops pinned to the fork ${tag}; upstream npm publishes ${upstream}\n` +
    `           the fork delta is in galaxy-mcp fixes.000; compare before assuming it is still needed`
  );
}

async function galaxyCharts() {
  const pinned = read("package.json").dependencies["galaxy-charts"].replace(/^[\^~]/, "");
  const latest = await npmLatest("galaxy-charts");
  return pinned === latest
    ? `charts     up to date at ${pinned}`
    : `charts     BEHIND: package.json wants ${pinned}, npm has ${latest}\n` +
        `           update: bump it, then python3 scripts/check_vendored.py to re-read the input contract`;
}

const results = await Promise.allSettled([skills(), galaxyMcp(), galaxyOps(), galaxyCharts()]);
for (const r of results) {
  console.log(r.status === "fulfilled" ? r.value : `(could not check: ${r.reason.message})`);
}
