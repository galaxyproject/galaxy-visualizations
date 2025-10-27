import { test, expect } from "@playwright/test";
import DATASET_COLUMNS_MATRIX from "./test-data/api.datasets.columns.matrix.json" with { type: "json" };
import DATASET_COLUMNS_NUMBER from "./test-data/api.datasets.columns.number.json" with { type: "json" };
import DATASET_COLUMNS_TEXT_NUMBER from "./test-data/api.datasets.columns.text.number.json" with { type: "json" };
import DATASET_DETAILS from "./test-data/api.datasets.details.json" with { type: "json" };

const maxDiffPixelRatio = 0.03;

test("basic", async ({ page }) => {
    // mock api
    await page.route("**/api/datasets/__test__", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_DETAILS),
        });
    });

    await page.route("**/api/datasets/__test__?data_type=raw_data&provider=dataset-column", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_COLUMNS_MATRIX),
        });
    });

    await page.route(
        "**/api/datasets/__test__?data_type=raw_data&provider=dataset-column&indeces=0%2C1",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(DATASET_COLUMNS_TEXT_NUMBER),
            });
        },
    );

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
    await expect(page).toHaveScreenshot("basic.png");
    await page.click(".n-button");
    await expect(page).toHaveScreenshot("basic_with_form.png", { maxDiffPixelRatio });

    // start pie
    await page.goto("http://localhost:5173?xml=plotly_pie");
    await expect(page).toHaveScreenshot("pie.png", { maxDiffPixelRatio });

    // start box
    await page.goto("http://localhost:5173?xml=plotly_box");
    await expect(page).toHaveScreenshot("box.png", { maxDiffPixelRatio });

    // start histogram
    await page.goto("http://localhost:5173?xml=plotly_histogram");
    await expect(page).toHaveScreenshot("histogram.png", { maxDiffPixelRatio });

    // start surface
    await page.goto("http://localhost:5173?xml=plotly_surface");
    await expect(page).toHaveScreenshot("surface.png", { maxDiffPixelRatio });

    // start heatmap
    await page.goto("http://localhost:5173?xml=plotly_heatmap");
    await expect(page).toHaveScreenshot("heatmap.png", { maxDiffPixelRatio });
});
