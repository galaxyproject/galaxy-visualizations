import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_CONTENT = readFileSync(resolve(__dirname, "test-data/astrip.nii.gz"));

test("basic", async ({ page }) => {
    await page.route("**/api/datasets/__test__", async (route) => {
        await route.fulfill({
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                extension: "nii1.gz"
            }),
        });
    });
    await page.route("**/api/datasets/__test__/display?__filename=file.nii1.gz", async (route) => {
        await route.fulfill({
            status: 200,
            headers: { "Content-Type": "application/gzip" },
            body: DATASET_CONTENT,
        });
    });
    await page.goto("http://localhost:5173/");
    await expect(page).toHaveScreenshot("0.png", { maxDiffPixelRatio: 0.02 });
});
