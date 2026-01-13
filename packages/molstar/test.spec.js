import { test, expect } from "@playwright/test";
import fs from "fs";

const TEST_DATASET = fs.readFileSync("./test-data/test.pdb", "utf-8");

const maxDiffPixelRatio = 0.06;

test("basic", async ({ page }) => {
    // mock api
    await page.route("**/api/datasets/__test__", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                extension: "pdb"
            }),
        });
    });

    await page.route("**/api/datasets/__test__/display", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: TEST_DATASET,
        });
    });

    // start
    await page.goto("http://localhost:5173/");
    await expect(page).toHaveScreenshot("test.png", { maxDiffPixelRatio });
});
