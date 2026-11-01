import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchData } from "./fetch-data.js";
import { WORKFLOWS } from "./workflows.js";

const COMPAT_DIR = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(COMPAT_DIR, "results", "webr");
const CACHE_DIR = join(COMPAT_DIR, "data", "repositories");
const REPOSITORIES = (
    process.env.WEBR_REPOSITORIES || "https://webr.bioconductor.org/3.23,https://repo.r-wasm.org"
).split(",");
const SELECTED = process.env.WORKFLOWS ? process.env.WORKFLOWS.split(",") : WORKFLOWS.map(({ id }) => id);

test.beforeAll(async () => {
    await fetchData();
    mkdirSync(RESULTS_DIR, { recursive: true });
});

for (const workflow of WORKFLOWS.filter(({ id }) => SELECTED.includes(id))) {
    test(workflow.id, async ({ context, page }) => {
        const downloads = [];
        await context.route("**/bin/emscripten/**", async (route) => {
            const url = new URL(route.request().url());
            const path = join(CACHE_DIR, url.host, url.pathname);
            const cached = existsSync(path);
            const response = cached ? null : await route.fetch();
            if (cached || response.ok()) {
                const body = cached ? readFileSync(path) : await response.body();
                if (!cached) {
                    mkdirSync(dirname(path), { recursive: true });
                    writeFileSync(path, body);
                }
                downloads.push({ url: url.href, bytes: body.length, cached });
                await route.fulfill({
                    status: 200,
                    body,
                    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/octet-stream" },
                });
            } else {
                downloads.push({ url: url.href, bytes: 0, cached, status: response.status() });
                await route.fulfill({ response });
            }
        });
        await page.goto("/compat/");
        const startup = await page.evaluate(async () => {
            const started = performance.now();
            await window.webrReady;
            return performance.now() - started;
        });
        const script = readFileSync(join(COMPAT_DIR, "workflows", `${workflow.id}.R`), "utf8");
        const run = await page.evaluate(
            async ({ packages, data, repositories, script }) => {
                const webR = window.webR;
                const shelter = await new webR.Shelter();
                const rString = (value) => JSON.stringify(value);
                const rVector = (values) => `c(${values.map(rString).join(", ")})`;
                const outcome = { packages: {}, install: {}, script: {} };
                const text = async ({ type, data }) => ({
                    type,
                    text: typeof data === "string" ? data : (await (await data.get("message")).toArray()).join("\n"),
                });
                const texts = (output) => Promise.all(output.map(text));

                await webR.FS.mkdir("/data");
                for (const name of data) {
                    const response = await fetch(`/compat/data/${name}`);
                    await webR.FS.writeFile(`/data/${name}`, new Uint8Array(await response.arrayBuffer()));
                }

                let started = performance.now();
                const install = await shelter.captureR(
                    `webr::install(${rVector(packages)}, repos = ${rVector(repositories)})`,
                );
                const installLines = await texts(install.output);
                outcome.install = {
                    seconds: (performance.now() - started) / 1000,
                    downloaded: installLines.filter(({ text }) => /Downloading webR package/.test(text)).length,
                    messages: installLines
                        .filter(({ text }) => !/Downloading webR package/.test(text))
                        .map(({ type, text }) => `${type}: ${text.trim()}`),
                };

                for (const name of packages) {
                    const check = await shelter.captureR(
                        `tryCatch({ suppressPackageStartupMessages(library(${rString(name)}, character.only = TRUE)); "ok" }, error = function(e) conditionMessage(e))`,
                    );
                    outcome.packages[name] = (await check.result.toArray())[0];
                }

                started = performance.now();
                const wrapped = `tryCatch({ ${script}\n invisible(NULL) }, error = function(e) cat(sprintf("ERROR %s: %s\\n", paste(deparse(conditionCall(e)), collapse = " "), conditionMessage(e))))`;
                const execution = await shelter.captureR(wrapped, { captureGraphics: { width: 640, height: 480 } });
                outcome.script.seconds = (performance.now() - started) / 1000;
                const lines = await texts(execution.output);
                outcome.script.results = Object.fromEntries(
                    lines
                        .filter(({ text }) => text.startsWith("RESULT "))
                        .map(({ text }) => {
                            const [, key, ...value] = text.trim().split(" ");
                            return [key, value.join(" ")];
                        }),
                );
                outcome.script.error = lines.find(({ text }) => text.startsWith("ERROR "))?.text.trim() || null;
                outcome.script.warnings = lines.filter(({ type }) => type === "warning").map(({ text }) => text);
                outcome.script.plots = [];
                for (const image of execution.images) {
                    const canvas = new OffscreenCanvas(image.width, image.height);
                    canvas.getContext("2d").drawImage(image, 0, 0);
                    const blob = await canvas.convertToBlob({ type: "image/png" });
                    const bytes = new Uint8Array(await blob.arrayBuffer());
                    outcome.script.plots.push(btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")));
                }

                const heap = await shelter.captureR(`webr::eval_js("Module.HEAPU8.length")`);
                outcome.heapBytes = (await heap.result.toArray())[0];
                const library = await shelter.captureR(`length(list.files(.libPaths()[1]))`);
                outcome.libraryPackages = (await library.result.toArray())[0];
                await shelter.purge();
                return outcome;
            },
            { packages: workflow.packages, data: workflow.data, repositories: REPOSITORIES, script },
        );
        const { plots, ...script_ } = run.script;
        plots.forEach((plot, index) =>
            writeFileSync(join(RESULTS_DIR, `${workflow.id}-${index + 1}.png`), Buffer.from(plot, "base64")),
        );
        const record = {
            workflow: workflow.id,
            repositories: REPOSITORIES,
            startupSeconds: startup / 1000,
            downloads: {
                count: downloads.length,
                bytes: downloads.reduce((sum, { bytes }) => sum + bytes, 0),
                cached: downloads.every(({ cached }) => cached),
                files: downloads.map(({ url, bytes }) => ({ url, bytes })),
            },
            ...run,
            script: { ...script_, plots: plots.length },
        };
        writeFileSync(join(RESULTS_DIR, `${workflow.id}.json`), JSON.stringify(record, null, 4));
        expect(record.workflow).toBe(workflow.id);
    });
}
