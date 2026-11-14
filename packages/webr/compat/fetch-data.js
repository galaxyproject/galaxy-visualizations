import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA } from "./workflows.js";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");

function sha256(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

export async function fetchData() {
    mkdirSync(DATA_DIR, { recursive: true });
    for (const [name, { url, sha256: expected }] of Object.entries(DATA)) {
        const path = join(DATA_DIR, name);
        if (!existsSync(path) || sha256(readFileSync(path)) !== expected) {
            const response = await fetch(url, { headers: { "User-Agent": "galaxy-visualizations-webr-compat" } });
            if (!response.ok) {
                throw new Error(`Could not fetch ${name}: HTTP ${response.status}. Download ${url} to ${path}.`);
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            if (sha256(buffer) !== expected) {
                throw new Error(`Checksum mismatch for ${name}`);
            }
            writeFileSync(path, buffer);
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await fetchData();
}
