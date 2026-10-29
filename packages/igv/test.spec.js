import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import FASTA_INDEXES from "./test-data/api.fasta_indexes.json" with { type: "json" };
import TWOBIT from "./test-data/api.twobit.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATASET_CONTENT = fs.readFileSync(path.resolve(__dirname, "./test-data/test.bed"), "utf8");
const DATASET_CONTENT_GENOME = fs.readFileSync(path.resolve(__dirname, "./test-data/test.fa"), "utf8");
const GENOME_DIR = path.resolve(__dirname, "./test-data/hg38");
const [HG38] = JSON.parse(fs.readFileSync(path.join(GENOME_DIR, "genomes.json"), "utf8"));
const GENOME_FILES = {
    "https://s3.amazonaws.com/igv.org.genomes/genomes.json": "genomes.json",
    "https://igv.org/genomes/genomes3.json": "igv-genomes.json",
    [HG38.twoBitURL]: "hg38.2bit",
    [HG38.chromSizesURL]: "hg38.chrom.sizes",
    [HG38.aliasURL]: "hg38_alias.tab",
    [HG38.cytobandURL]: "cytoBandIdeo.txt.gz",
    [HG38.tracks[0].url]: "ncbiRefSeq.txt.gz",
};
const DATASET_DETAILS = {
    extension: "bed",
    hid: 1,
    history_id: "history_id",
    id: "__test_pw__",
    metadata_dbkey: "hg38",
    name: "__test_pw__",
};
const DATASET_DETAILS_DROPPED = {
    extension: "bed",
    hid: 2,
    history_id: "history_id",
    id: "__test_pw_dropped__",
    metadata_dbkey: "hg38",
    name: "__test_pw_dropped__",
};
const DATASET_DETAILS_GENOME = {
    extension: "fasta",
    history_id: "history_id",
    hid: 3,
    id: "__test_pw_genome__",
    metadata_dbkey: "hg38",
    name: "__test_pw_genome__",
};

async function routeGenome(page) {
    await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());
    await page.route(
        (url) => url.href in GENOME_FILES,
        async (route) => {
            const request = route.request();
            const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
            if (request.method() === "OPTIONS") {
                await route.fulfill({ status: 204, headers });
            } else {
                const body = fs.readFileSync(path.join(GENOME_DIR, GENOME_FILES[request.url()]));
                const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers()["range"] || "");
                if (range) {
                    const start = Number(range[1]);
                    const end = Math.min(Number(range[2]), body.length - 1);
                    await route.fulfill({
                        status: 206,
                        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${body.length}` },
                        body: body.subarray(start, end + 1),
                    });
                } else {
                    await route.fulfill({ status: 200, headers, body });
                }
            }
        },
    );
}

async function createMockDatasetElement(page) {
    await page.evaluate(() => {
        const el = document.createElement("div");
        el.className = "mock-dataset-item";
        el.textContent = "Mock Dataset";
        el.draggable = true;
        el.style.position = "fixed";
        el.style.top = "50px";
        el.style.left = "50px";
        el.style.background = "#ccc";
        el.style.padding = "5px";
        el.style.zIndex = 10000;
        document.body.appendChild(el);
    });
}

async function dragAndDropDataset(page, datasetId, datasetName) {
    await page.evaluate(
        ([datasetId, datasetName]) => {
            const source = document.querySelector(".mock-dataset-item");
            const target = document.querySelector("#viewport");
            const dataTransfer = new DataTransfer();
            const datasetPayload = [
                [
                    {
                        history_content_type: "dataset",
                        id: datasetId,
                        name: datasetName,
                    },
                ],
            ];
            const json = JSON.stringify(datasetPayload);
            dataTransfer.setData("text", json);
            dataTransfer.items.add(json, "application/json");
            const trigger = (el, type, dt) =>
                el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
            trigger(source, "dragstart", dataTransfer);
            trigger(target, "dragenter", dataTransfer);
            trigger(target, "dragover", dataTransfer);
            trigger(target, "drop", dataTransfer);
            trigger(source, "dragend", dataTransfer);
        },
        [datasetId, datasetName],
    );
}

test("basic load and drag-drop dataset", async ({ page }) => {
    const routes = [
        {
            url: "**/api/histories/history_id/contents?**",
            body: [DATASET_DETAILS, DATASET_DETAILS_DROPPED, DATASET_DETAILS_GENOME],
        },
        { url: "**/api/datasets/__test_pw__/display", body: DATASET_CONTENT, raw: true },
        { url: "**/api/datasets/__test_pw__", body: DATASET_DETAILS },
        { url: "**/api/datasets/__test_pw_dropped__/display", body: DATASET_CONTENT, raw: true },
        { url: "**/api/datasets/__test_pw_dropped__", body: DATASET_DETAILS_DROPPED },
        { url: "**/api/datasets/__test_pw_genome__", body: DATASET_DETAILS_GENOME },
        { url: "**/api/datasets/__test_pw_genome__/display", body: DATASET_CONTENT_GENOME, raw: true },
        { url: "**/api/tool_data/fasta_indexes", body: FASTA_INDEXES },
        { url: "**/api/tool_data/twobit", body: TWOBIT },
        { url: "**/api/version", body: { version_major: "25.1", version_minor: "rc1" } },
    ];
    for (const r of routes) {
        await page.route(r.url, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: r.raw ? r.body : JSON.stringify(r.body),
            });
        });
    }
    await routeGenome(page);
    const messages = [];
    page.on("console", (msg) => messages.push(msg.text()));
    await page.goto("/?dataset_id=__test_pw__");
    await page.waitForSelector(".igv-track-label[title='__test_pw__']");
    await expect(page).toHaveScreenshot("0.png", { threshold: 0 });
    await page.click(".n-button");
    await expect(page).toHaveScreenshot("1.png", { threshold: 0 });
    await page.fill(".igv-search-input", "chr1:1-150,000");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("2.png", { threshold: 0 });
    await createMockDatasetElement(page);
    await dragAndDropDataset(page, "__test_pw_dropped__", "__test_pw_dropped__");
    await page.waitForSelector(".igv-track-label[title='__test_pw_dropped__']");
    const accepted = messages.some((msg) => msg.includes("[igv] Dropped Tracks"));
    expect(accepted).toBeTruthy();
    await expect(page).toHaveScreenshot("3.png", { threshold: 0 });
});
