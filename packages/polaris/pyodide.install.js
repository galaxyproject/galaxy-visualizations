#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* Download Pyodide package artifacts from the CDN and store them locally. */
export function downloadFiles(pyodideDir, fileNames, version) {
    const baseUrl = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
    fs.mkdirSync(pyodideDir, { recursive: true });
    for (const fileName of fileNames) {
        const destPath = path.join(pyodideDir, fileName);
        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            const url = `${baseUrl}${fileName}`;
            console.log(`Downloading ${url}.`);
            execSync(`curl -fsSL -o "${destPath}" "${url}"`);
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

/* Get all package filenames including their dependencies */
export function getPackageFileNames(pyodideDir, packageNames) {
    const lockPath = path.join(pyodideDir, "pyodide-lock.json");
    const lockText = fs.readFileSync(lockPath, "utf-8");
    const lockJson = JSON.parse(lockText);
    const packages = lockJson.packages || (lockJson.lock && lockJson.lock.packages) || {};
    const visited = new Set();
    const files = new Set();
    function getEntry(name) {
        return packages[name] || packages[name.replace(/-/g, "_")] || null;
    }
    function getDepends(entry) {
        if (entry && Array.isArray(entry.depends)) {
            return entry.depends;
        }
        if (entry && Array.isArray(entry.dependencies)) {
            return entry.dependencies;
        }
        return [];
    }
    function getFileName(entry) {
        if (entry && typeof entry.file_name === "string") {
            return entry.file_name;
        }
        if (entry && typeof entry.filename === "string") {
            return entry.filename;
        }
        return null;
    }
    function normalize(name) {
        return name.toLowerCase().replace(/_/g, "-");
    }
    function getEntry(name) {
        return packages[normalize(name)] || null;
    }
    function walk(name) {
        const key = normalize(name);
        if (visited.has(key)) {
            return;
        } else {
            visited.add(key);
            const entry = getEntry(key);
            if (!entry) {
                throw new Error(`Package not found in pyodide-lock.json: ${name}`);
            } else {
                const fileName = getFileName(entry);
                if (fileName) {
                    files.add(fileName);
                }
                const deps = getDepends(entry);
                for (const dep of deps) {
                    walk(dep);
                }
            }
        }
    }
    for (const name of packageNames) {
        walk(name);
    }
    return Array.from(files);
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

/** Installs pyodide and packages */
function main() {
    const repoRoot = __dirname;
    const destDir = path.join(repoRoot, "static", "pyodide");
    const nodePath = path.join(repoRoot, "node_modules", "pyodide");
    const tempDir = path.join(repoRoot, "temp", "pyodide");
    const version = getInstalledVersion(repoRoot);
    console.log(`Installed version: ${version}.`);
    const installPackages = getPackageNames(repoRoot);
    const dependencies = getPackageFileNames(nodePath, installPackages);
    downloadFiles(tempDir, dependencies, version);
    console.log("Done.");
}

try {
    main();
} catch (e) {
    console.error(e);
    process.exitCode = 1;
}
