import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WORKFLOWS } from "./workflows.js";

const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "results");

function load(kind, id) {
    const path = join(RESULTS_DIR, kind, `${id}.json`);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function agreement(webr, native) {
    const a = Number(webr);
    const b = Number(native);
    if (webr === native) {
        return "same";
    } else if (Number.isFinite(a) && Number.isFinite(b)) {
        const relative = Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
        return relative < 1e-6 ? "same" : relative < 1e-2 ? "close" : "differs";
    } else {
        return "differs";
    }
}

const megabytes = (bytes) => (bytes / 1e6).toFixed(1);
const cell = (text) => text.replace(/\s+/g, " ").replace(/\|/g, "\\|").slice(0, 160);
const lines = [
    "| Workflow | Packages attach | Script | Downloads | Install (cached) | webR run | Native run | Heap |",
    "|---|---|---|---|---|---|---|---|",
];
const details = [];
for (const { id } of WORKFLOWS) {
    const webr = load("webr", id);
    const native = load("native", id);
    if (webr) {
        const failed = Object.entries(webr.packages).filter(([, status]) => status !== "ok");
        const attach = failed.length ? cell(failed.map(([name, status]) => `${name}: ${status}`).join("; ")) : "all";
        const script = webr.script.error ? cell(`error: ${webr.script.error}`) : `ok, ${webr.script.plots} plots`;
        lines.push(
            `| ${id} | ${attach} | ${script} | ${webr.downloads.count} files, ${megabytes(webr.downloads.bytes)} MB | ${webr.install.seconds.toFixed(1)} s | ${webr.script.seconds.toFixed(1)} s | ${native ? `${native.script.seconds.toFixed(1)} s` : "—"} | ${megabytes(webr.heapBytes)} MB |`,
        );
        const keys = [...new Set([...Object.keys(webr.script.results), ...Object.keys(native?.script.results || {})])];
        if (keys.length) {
            details.push(`\n**${id}**\n`, "| Result | webR | Native | Agreement |", "|---|---|---|---|");
            for (const key of keys) {
                const a = webr.script.results[key];
                const b = native?.script.results[key];
                details.push(
                    `| ${key} | ${a ?? "—"} | ${b ?? "—"} | ${a !== undefined && b !== undefined ? agreement(a, b) : "—"} |`,
                );
            }
        }
    }
}
const report = [...lines, ...details].join("\n") + "\n";
writeFileSync(join(RESULTS_DIR, "report.md"), report);
process.stdout.write(report);
