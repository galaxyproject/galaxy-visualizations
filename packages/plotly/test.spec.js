import { test, expect } from "@playwright/test";
import DATASET_COLUMNS from "./test-data/api.datasets.columns.json" with { type: "json" };
import DATASET_DETAILS from "./test-data/api.datasets.details.json" with { type: "json" };

test("basic", async ({ page }) => {
    // mock api
    await page.route("**/api/datasets/__test__", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_DETAILS),
        });
    });

    await page.route("**/api/datasets/__test__?data_type=raw_data&provider=dataset-column&indeces=1", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_COLUMNS),
        });
    });

    await page.route("**/api/datasets/__test__?data_type=raw_data&provider=dataset-column&indeces=2", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_COLUMNS),
        });
    });

    // start
    await page.goto("http://localhost:5173/");
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot("0.png", { maxDiffPixelRatio: 0.02 });
});
