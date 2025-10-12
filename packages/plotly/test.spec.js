import { test, expect } from "@playwright/test";
import DATASET_DETAILS from "./testing/api.datasets.id.json" with { type: "json" };
import DATASET_COLUMNS from "./testing/api.datasets.columns.json" with { type: "json" };

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
    await page.goto("http://localhost:8000/");
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot("0.png");
});
