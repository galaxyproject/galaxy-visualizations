import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import FASTA_INDEXES from "./test-data/api.fasta_indexes.json" with { type: "json" };
import TWOBIT from "./test-data/api.twobit.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATASET_CONTENT = fs.readFileSync(path.resolve(__dirname, "./test-data/test.bed"), "utf8");
const DATASET_DETAILS = { extension: "bed", history_id: "0", id: "__test__", name: "__test__", hid: 0 };

test("basic", async ({ page }) => {
    await page.route(
        "**/api/histories/0/contents?v=dev&order=hid&q=deleted&qv=false&q=visible&qv=true&limit=100",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([DATASET_DETAILS]),
            });
        },
    );
    await page.route("**/api/datasets/__test__/display", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: DATASET_CONTENT,
        });
    });
    await page.route("**/api/datasets/__test__", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_DETAILS),
        });
    });
    await page.route("**/api/tool_data/fasta_indexes", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(FASTA_INDEXES),
        });
    });
    await page.route("**/api/tool_data/twobit", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(TWOBIT),
        });
    });

    page.on("console", msg => console.log(msg.type(), msg.text()));
    page.on("request", request => console.log("Request:", request.url(), request.method(), request.postData()));
    page.on("response", async response => {
        const url = response.url();
        const status = response.status();
        console.log("Response:", url, status);
    });
    await page.goto("http://localhost:5173/");
    await page.waitForSelector(".igv-track-label[title='Track']");
    await expect(page).toHaveScreenshot("0.png", { maxDiffPixelRatio: 0.02 });
    await page.click(".n-button");
    await expect(page).toHaveScreenshot("1.png", { maxDiffPixelRatio: 0.02 });
    await page.fill(".igv-search-input", "chr1:1-150,000");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("2.png", { maxDiffPixelRatio: 0.02 });
});
