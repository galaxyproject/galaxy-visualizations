#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/* Download each package from the CDN unless a copy with the lock's digest is already here. */
export async function downloadFiles(pyodideDir, files, version) {
  const baseUrl = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
  fs.mkdirSync(pyodideDir, { recursive: true });
  for (const [fileName, digest] of files) {
    const destPath = path.join(pyodideDir, fileName);
    if (fs.existsSync(destPath) && sha256(destPath) === digest) {
      continue;
    }
    const url = `${baseUrl}${fileName}`;
    console.log(`Downloading ${url}.`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`${url}: HTTP ${res.status}`);
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
    const got = sha256(destPath);
    if (got !== digest) {
      fs.rmSync(destPath);
      throw new Error(`${fileName}: sha256 ${got} does not match the lock's ${digest}`);
    }
  }
}

/* Read the installed pyodide version from node_modules. */
export function getInstalledVersion(repoRoot) {
  const pkgPath = path.join(repoRoot, "node_modules", "pyodide", "package.json");
  const text = fs.readFileSync(pkgPath, "utf-8");
  const json = JSON.parse(text);
  if (typeof json.version !== "string") {
    throw new Error("Unable to determine pyodide version from package.json");
  }
  return json.version;
}

/* Every package file the named packages need, with the digest the lock states for it. */
export function getPackageFiles(pyodideDir, packageNames) {
  const lockPath = path.join(pyodideDir, "pyodide-lock.json");
  const packages = JSON.parse(fs.readFileSync(lockPath, "utf-8")).packages || {};
  const normalize = (name) => name.toLowerCase().replace(/_/g, "-");
  const files = new Map();
  const visited = new Set();
  function walk(name) {
    const key = normalize(name);
    if (visited.has(key)) {
      return;
    }
    visited.add(key);
    const entry = packages[key];
    if (!entry) {
      throw new Error(`Package not found in pyodide-lock.json: ${name}`);
    }
    files.set(entry.file_name, entry.sha256);
    for (const dep of entry.depends || []) {
      walk(dep);
    }
  }
  for (const name of packageNames) {
    walk(name);
  }
  return files;
}

/* Read list of required packages. */
export function getPackageNames(repoRoot) {
  const installPackages = [];
  const dependenciesPath = path.join(repoRoot, "pyodide.requirements.txt");
  const deps = fs.readFileSync(dependenciesPath, "utf-8").split(/\r?\n/);
  for (const line of deps) {
    const v = line.trim();
    if (v !== "" && !v.startsWith("#")) {
      installPackages.push(v);
    }
  }
  return installPackages;
}

/* Place the pyodide runtime and every wheel where the page will load them. */
export function copyRuntime(nodePath, tempDir, destDir, fileNames) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const fileName of fileNames) {
    const from = path.join(tempDir, fileName);
    const to = path.join(destDir, fileName);
    if (fs.existsSync(from)) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
  // The interpreter itself ships from node_modules, not the CDN.
  for (const entry of fs.readdirSync(nodePath)) {
    if (entry.endsWith(".whl") || entry === "package.json" || entry.startsWith("pyodide-lock")) {
      continue;
    }
    const from = path.join(nodePath, entry);
    if (fs.statSync(from).isFile()) {
      fs.copyFileSync(from, path.join(destDir, entry));
    }
  }
  fs.copyFileSync(
    path.join(nodePath, "pyodide-lock.json"),
    path.join(destDir, "pyodide-lock.json"),
  );
}

/** Installs pyodide and packages */
async function main() {
  const repoRoot = __dirname;
  const destDir = path.join(repoRoot, "static", "pyodide");
  const nodePath = path.join(repoRoot, "node_modules", "pyodide");
  const tempDir = path.join(repoRoot, "temp", "pyodide");
  const version = getInstalledVersion(repoRoot);
  console.log(`Installed version: ${version}.`);
  const files = getPackageFiles(nodePath, getPackageNames(repoRoot));
  await downloadFiles(tempDir, files, version);
  // The browser loads from static/pyodide, so the wheels have to land there; the
  // temp dir is only a download cache.
  copyRuntime(nodePath, tempDir, destDir, [...files.keys()]);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
