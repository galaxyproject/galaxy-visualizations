import { test, expect } from "@playwright/test";
import DATASET_CONTENT from "./test-data/test.json" with { type: "json" };

test("basic", async ({ page }) => {
    await page.route("http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.cytoscapejson", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_CONTENT),
        });
    });

    // start
    await page.goto("http://localhost:5173/");
    await expect(page).toHaveScreenshot("0.png", { maxDiffPixelRatio: 0.02 });
});
