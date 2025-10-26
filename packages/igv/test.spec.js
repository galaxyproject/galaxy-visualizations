import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import FASTA_INDEXES from "./test-data/api.fasta_indexes.json" with { type: "json" };
import TWOBIT from "./test-data/api.twobit.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATASET_CONTENT = fs.readFileSync(path.resolve(__dirname, "./test-data/test.bed"), "utf8");
const DATASET_DETAILS = { extension: "bed", history_id: "history_id", id: "__test_pw__", name: "__test_pw__" };

test("basic", async ({ page }) => {
    const routes = [
        { url: "**/api/histories/history_id/contents?**", body: [DATASET_DETAILS] },
        { url: "**/api/datasets/__test_pw__/display", body: DATASET_CONTENT, raw: true },
        { url: "**/api/datasets/__test_pw__", body: DATASET_DETAILS },
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

    page.on("console", (msg) => console.log(msg.type(), msg.text()));
    page.on("response", async (response) => {
        const url = response.url();
        const status = response.status();
        console.log("Response:", url, status);
    });

    await page.goto("http://localhost:5173?dataset_id=__test_pw__");
    await page.waitForSelector(".igv-track-label[title='__test_pw__']");
    await expect(page).toHaveScreenshot("0.png", { maxDiffPixelRatio: 0.03 });
    await page.click(".n-button");
    await expect(page).toHaveScreenshot("1.png", { maxDiffPixelRatio: 0.03 });
    await page.fill(".igv-search-input", "chr1:1-150,000");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("2.png", { maxDiffPixelRatio: 0.03 });
});
