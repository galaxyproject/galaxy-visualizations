import { test, expect } from "@playwright/test";
import DATASET_CONTENT from "./test-data/1.hyphy_results.json" with { type: "json" };

const maxDiffPixelRatio = 0.03;

test("basic", async ({ page }) => {
    // mock api
    await page.route("**/api/datasets/__test__", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_CONTENT),
        });
    });

    // start
    await page.goto("http://localhost:8080/");
    await expect(page).toHaveScreenshot("1.png", { maxDiffPixelRatio });
});
