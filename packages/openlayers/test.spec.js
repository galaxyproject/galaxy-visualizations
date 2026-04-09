import { test, expect } from "@playwright/test";
import fs from "fs";

const DATASET_CONTENT = fs.readFileSync("./test-data/test.geojson", "utf-8");

test("basic", async ({ page }) => {
    await page.route("http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.geojson", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: DATASET_CONTENT,
        });
    });

    // Block tile requests so the basemap is deterministic across machines
    await page.route("**://*.openstreetmap.org/**", async (route) => {
        await route.fulfill({ status: 204, body: "" });
    });

    await page.goto("http://localhost:5173/");
    await page.waitForSelector("canvas");
    // Give OpenLayers a moment to finish its initial render
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("0.png", { maxDiffPixelRatio: 0.05 });
});
