import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const maxDiffPixelRatio = 0.07;

const TESTS = {
    csv: { file: "test.csv", extension: "csv", contentType: "text/csv" },
    tabular: { file: "test.tabular", extension: "tabular", contentType: "text/tab-separated-values" },
    tsv: { file: "test.tsv", extension: "tsv", contentType: "text/tab-separated-values" },
};

test("basic", async ({ page }) => {
    await page.route("**/api/datasets/**", async (route) => {
        const url = new URL(route.request().url());
        const match = url.pathname.match(/\/api\/datasets\/([^/]+)(\/display)?$/);
        const name = match?.[1];
        const fixture = name ? TESTS[name] : null;
        if (!fixture) {
            return route.continue();
        }
        if (match[2] === "/display") {
            const body = readFileSync(join(__dirname, "test-data", fixture.file));
            await route.fulfill({ status: 200, contentType: fixture.contentType, body });
        } else {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ extension: fixture.extension }),
            });
        }
    });

    for (const name of Object.keys(TESTS)) {
        await page.goto(`http://localhost:5173?dataset_id=${name}`);
        await page.waitForSelector("canvas", { timeout: 90000 });
        await page.waitForTimeout(2000);
        await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio });
    }
});
