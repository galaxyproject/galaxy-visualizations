#!/usr/bin/env node
/**
 * Fetch the vaRRI-js upstream assets (GUI, library, Fornac dependencies) into
 * ./static, mirroring the repository root layout of:
 *   https://github.com/BackofenLab/vaRRI-js
 *
 * This is the temporary equivalent of installing the upstream vaRRI-js
 * package from npm: Galaxy's plugin installer (client/scripts/build.mjs in
 * the Galaxy distribution) copies the contents of
 * `config/plugins/visualizations/varri/static` into Galaxy's static tree, so
 * the plugin must carry all upstream styles and scripts with it.
 *
 * Until vaRRI-js is published to npm, assets are downloaded from the latest
 * commit of the upstream `main` branch. Once the npm package exists, either
 * of these works without any further changes:
 *
 *   1. `npm install varri-js` in this package directory - this script then
 *      copies the assets from `node_modules/varri-js` instead of GitHub, or
 *   2. drop this script entirely and let Galaxy's visualizations.yml install
 *      the published `@galaxyproject/varri` package.
 *
 * The only files maintained here are `public/` (varri.xml, varri.js,
 * logo.svg). Everything else in `static/` is generated and must never be
 * edited by hand - run `npm run fetch-upstream` to update it.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM_REPO = "BackofenLab/vaRRI-js";
const UPSTREAM_REF = process.env.VARRI_UPSTREAM_REF || "main";
const UPSTREAM_NPM_PACKAGE = "varri-js";

// Files/directories mirrored from the upstream repository into static/.
// These are exactly what the upstream GUI (index.html) references.
const UPSTREAM_FILES = [
    "index.html",
    "index.js",
    "style.css",
    "dist",
    "src",
    "fornac",
    "LICENSE",
    "README.md",
    "README.html",
    "citation.html",
];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_DIR = path.join(ROOT, "static");
const PUBLIC_DIR = path.join(ROOT, "public");

function run(cmd, args) {
    const result = spawnSync(cmd, args, { encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(`${cmd} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout.trim();
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { "User-Agent": "galaxy-visualizations/varri" },
    });
    if (!response.ok) {
        throw new Error(`GET ${url} -> ${response.status}`);
    }
    return response.json();
}

async function downloadAndExtract(shaOrRef, workDir) {
    const tarballUrl =
        /^[0-9a-f]{40}$/.test(shaOrRef)
            ? `https://github.com/${UPSTREAM_REPO}/archive/${shaOrRef}.tar.gz`
            : `https://github.com/${UPSTREAM_REPO}/archive/refs/heads/${shaOrRef}.tar.gz`;
    const response = await fetch(tarballUrl, {
        headers: { "User-Agent": "galaxy-visualizations/varri" },
    });
    if (!response.ok) {
        throw new Error(`GET ${tarballUrl} -> ${response.status}`);
    }
    const tarball = path.join(workDir, "upstream.tar.gz");
    fs.writeFileSync(tarball, Buffer.from(await response.arrayBuffer()));
    run("tar", ["-xzf", tarball, "-C", workDir]);
    const extracted = fs
        .readdirSync(workDir)
        .filter((entry) => entry.startsWith("vaRRI-js-") && fs.statSync(path.join(workDir, entry)).isDirectory());
    if (extracted.length !== 1) {
        throw new Error(`Unexpected tarball layout, found: ${extracted.join(", ")}`);
    }
    return path.join(workDir, extracted[0]);
}

async function main() {
    let upstreamDir;
    let sourceLabel;
    let commitSha = null;
    let workDir = null;

    const npmPackageDir = path.join(ROOT, "node_modules", UPSTREAM_NPM_PACKAGE);
    if (fs.existsSync(npmPackageDir)) {
        // Upstream package already installed via npm - prefer it.
        upstreamDir = npmPackageDir;
        sourceLabel = `npm package ${UPSTREAM_NPM_PACKAGE} (node_modules)`;
        try {
            const pkgJson = JSON.parse(fs.readFileSync(path.join(npmPackageDir, "package.json"), "utf8"));
            commitSha = pkgJson.version;
        } catch {
            // not fatal, provenance just lacks a version
        }
    } else {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "varri-upstream-"));
        try {
            try {
                const commit = await fetchJson(`https://api.github.com/repos/${UPSTREAM_REPO}/commits/${UPSTREAM_REF}`);
                commitSha = commit.sha;
            } catch (err) {
                console.warn(`Could not resolve upstream ref '${UPSTREAM_REF}' via GitHub API: ${err.message}`);
                console.warn("Falling back to the branch tarball without a pinned commit.");
            }
            const ref = commitSha || UPSTREAM_REF;
            upstreamDir = await downloadAndExtract(ref, workDir);
            sourceLabel = commitSha
                ? `GitHub commit ${commitSha} (${UPSTREAM_REPO}@${UPSTREAM_REF})`
                : `GitHub branch ${UPSTREAM_REF} (${UPSTREAM_REPO})`;
        } catch (err) {
            fs.rmSync(workDir, { recursive: true, force: true });
            throw err;
        }
    }

    try {
        // 1. Remove previously fetched upstream files (avoid stale leftovers).
        fs.mkdirSync(STATIC_DIR, { recursive: true });
        for (const name of UPSTREAM_FILES) {
            fs.rmSync(path.join(STATIC_DIR, name), { recursive: true, force: true });
        }

        // 2. Copy upstream files.
        for (const name of UPSTREAM_FILES) {
            const src = path.join(upstreamDir, name);
            if (!fs.existsSync(src)) {
                console.warn(`Upstream file not found (skipped): ${name}`);
                continue;
            }
            fs.cpSync(src, path.join(STATIC_DIR, name), { recursive: true });
        }

        // 3. Copy the maintained Galaxy-side glue files. Must run after the
        //    upstream copy so they can never be clobbered.
        fs.cpSync(PUBLIC_DIR, STATIC_DIR, { recursive: true });

        // 4. Hide the upstream page header/footer in the staged index.html.
        //    This is the only modification of upstream code and is re-applied
        //    on every fetch (upstream re-adds these elements on each release).
        const indexPath = path.join(STATIC_DIR, "index.html");
        const indexHtml = fs.readFileSync(indexPath, "utf8");
        if (!indexHtml.includes("data-galaxy-plugin-varri")) {
            const hideRule = "<style data-galaxy-plugin-varri>header,footer{display:none!important}</style>";
            fs.writeFileSync(indexPath, indexHtml.replace("</head>", `    ${hideRule}\n  </head>`));
        }

        // 5. Provenance for reproducibility.
        const provenance = [
            `vaRRI-js upstream assets for the Galaxy visualization plugin`,
            `repository: https://github.com/${UPSTREAM_REPO}`,
            `source: ${sourceLabel}`,
            `fetched: ${new Date().toISOString()}`,
        ].join("\n") + "\n";
        fs.writeFileSync(path.join(STATIC_DIR, "SOURCE.txt"), provenance);
    } finally {
        if (workDir) {
            fs.rmSync(workDir, { recursive: true, force: true });
        }
    }

    const glueFiles = fs.readdirSync(PUBLIC_DIR).join(", ");
    console.log(`vaRRI-js assets staged into ${path.relative(ROOT, STATIC_DIR)}/ from ${sourceLabel}`);
    console.log(`Maintained glue files: ${glueFiles}`);
    console.log("Run 'npm run fetch-upstream' to refresh from upstream at any time.");
}

main().catch((err) => {
    console.error(`Failed to fetch vaRRI-js upstream assets: ${err.message}`);
    process.exit(1);
});
