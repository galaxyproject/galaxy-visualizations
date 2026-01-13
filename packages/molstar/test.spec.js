import { test, expect } from "@playwright/test";
import fs from "fs";

const TEST_CIF = fs.readFileSync("./test-data/test.cif");
const TEST_PDB = fs.readFileSync("./test-data/test.pdb");

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
            body: TEST_PDB,
        });
    });

    await page.route("**/api/datasets/__cif__", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                extension: "cif"
            }),
        });
    });

    await page.route("**/api/datasets/__cif__/display", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: TEST_CIF,
        });
    });

    // start
    await page.goto("http://localhost:5173/");
    await expect(page).toHaveScreenshot("test_pdb.png", { maxDiffPixelRatio });

    await page.goto("http://localhost:5173?dataset_id=__cif__");
    await expect(page).toHaveScreenshot("test_cif.png", { maxDiffPixelRatio });
});
