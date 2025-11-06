import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import FASTA_INDEXES from "./test-data/api.fasta_indexes.json" with { type: "json" };
import TWOBIT from "./test-data/api.twobit.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATASET_CONTENT = fs.readFileSync(path.resolve(__dirname, "./test-data/test.bed"), "utf8");
const DATASET_DETAILS = {
    extension: "bed",
    history_id: "history_id",
    id: "__test_pw__",
    metadata_dbkey: "hg38",
    name: "__test_pw__",
};
const DATASET_DETAILS_DROPPED = {
    extension: "bed",
    history_id: "history_id",
    id: "__test_pw_dropped__",
    name: "__test_pw_dropped__",
};

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
            const target = document.querySelector(".h-screen.overflow-auto");
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
        { url: "**/api/histories/history_id/contents?**", body: [DATASET_DETAILS] },
        { url: "**/api/datasets/__test_pw__/display", body: DATASET_CONTENT, raw: true },
        { url: "**/api/datasets/__test_pw__", body: DATASET_DETAILS },
        { url: "**/api/datasets/__test_pw_dropped__/display", body: DATASET_CONTENT, raw: true },
        { url: "**/api/datasets/__test_pw_dropped__", body: DATASET_DETAILS_DROPPED },
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
    const messages = [];
    page.on("console", (msg) => messages.push(msg.text()));
    await page.goto("http://localhost:5173?dataset_id=__test_pw__");
    await page.waitForSelector(".igv-track-label[title='__test_pw__']");
    await expect(page).toHaveScreenshot("0.png", { maxDiffPixelRatio: 0.03 });
    await page.click(".n-button");
    await expect(page).toHaveScreenshot("1.png", { maxDiffPixelRatio: 0.03 });
    await page.fill(".igv-search-input", "chr1:1-150,000");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("2.png", { maxDiffPixelRatio: 0.03 });
    await createMockDatasetElement(page);
    await dragAndDropDataset(page, "__test_pw_dropped__", "__test_pw_dropped__");
    await page.waitForSelector(".igv-track-label[title='__test_pw_dropped__']");
    const accepted = messages.some((msg) => msg.includes("[igv] Dropped Tracks"));
    expect(accepted).toBeTruthy();
    await expect(page).toHaveScreenshot("4.png", { maxDiffPixelRatio: 0.03 });
});
