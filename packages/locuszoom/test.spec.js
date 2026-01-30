import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BGZIP = readFileSync(resolve(__dirname, "test-data/test.gwas_bgzip"));
const TABIX = readFileSync(resolve(__dirname, "test-data/test.gwas_bgzip.tbi"));

const maxDiffPixelRatio = 0.06;

function fulfillBinary(route, data) {
    const rangeHeader = route.request().headers()["range"];
    const match = rangeHeader?.match(/bytes=(\d+)-(\d+)/);
    if (match) {
        const start = parseInt(match[1]);
        const end = Math.min(parseInt(match[2]), data.length - 1);
        const slice = data.subarray(start, end + 1);
        return route.fulfill({
            status: 206,
            contentType: "application/octet-stream",
            headers: {
                "Content-Range": `bytes ${start}-${end}/${data.length}`,
                "Content-Length": String(slice.length),
            },
            body: slice,
        });
    }
    return route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: data,
    });
}

test("Run plot", async ({ page }) => {
    // Test variables
    const URL = "http://localhost:5173/";
    const CHR_INPUT = "raya560ne.2.1.2"; // a chromosome
    const POINT = "#lz-plot_association_associationpvalues_-RAYA560NE21261284_TC"; // a point in the plot
    const POINT_LOCATOR = page.locator(POINT);
    const PHENO_STAT = "×phenRAYA560NE.2.1.2:61284_T/"; // stats' table for the point
    const PHENO_STAT_TO_CLICK = page.getByText(PHENO_STAT);

    // mock api
    await page.route("**/api/datasets/__test__/display", async (route) => {
        await fulfillBinary(route, BGZIP);
    });

    await page.route("**/api/datasets/__test__tabix__/display", async (route) => {
        await fulfillBinary(route, TABIX);
    });

    await page.goto(URL);
    await page.getByRole("button").click();
    await page.getByRole("textbox", { name: "Please Input" }).nth(1).fill(CHR_INPUT);
    await expect(POINT_LOCATOR).toBeVisible();
    await POINT_LOCATOR.click();
    await PHENO_STAT_TO_CLICK.click();
    await expect(PHENO_STAT_TO_CLICK).toBeVisible();
    await page.getByRole("button", { name: "×" }).click();
    await expect(PHENO_STAT_TO_CLICK).toBeHidden();
    await expect(page).toHaveScreenshot("test.png", { maxDiffPixelRatio });
});
