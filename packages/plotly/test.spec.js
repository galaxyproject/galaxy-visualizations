import { test, expect } from "@playwright/test";
import DATASET_COLUMNS_NUMBER from "./test-data/api.datasets.columns.number.json" with { type: "json" };
import DATASET_COLUMNS_TEXT_NUMBER from "./test-data/api.datasets.columns.text.number.json" with { type: "json" };
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

    await page.route("**/api/datasets/__test__?data_type=raw_data&provider=dataset-column&indeces=0%2C1", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_COLUMNS_TEXT_NUMBER),
        });
    });

    await page.route("**/api/datasets/__test__?data_type=raw_data&provider=dataset-column&indeces=1", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_COLUMNS_NUMBER),
        });
    });

    await page.route("**/api/datasets/__test__?data_type=raw_data&provider=dataset-column&indeces=2", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_COLUMNS_NUMBER),
        });
    });

    // start
    await page.goto("http://localhost:5173/");
    await expect(page).toHaveScreenshot("0.png", { maxDiffPixelRatio: 0.02 });
    await page.click(".n-button");
    await expect(page).toHaveScreenshot("1.png", { maxDiffPixelRatio: 0.02 });

    // start pie
    await page.goto("http://localhost:5173?xml=plotly_pie");
    await expect(page).toHaveScreenshot("2.png", { maxDiffPixelRatio: 0.02 });
});
