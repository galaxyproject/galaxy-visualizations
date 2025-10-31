import { test, expect } from "@playwright/test";

const maxDiffPixelRatio = 0.06;

const TESTS = {
    ABSREL: "span:text('branches with evidence of selection')",
    BGM: "h4:text('Co-Evolving Pairs of Sites Detected by BGM')",
    BUSTED: "span:text('Expected fractions of MH subs (2H:3H)')",
    FADE: "td:text('-2637.14')",
    FEL: "td:text('0.4425')",
    FUBAR: "td:text('209.557')",
    GARD: "b:text('2421334')",
    MEME: "td:text('5.106')",
    RELAX: "td:text('2.44 (16.81%)')",
    SLAC: "td:text('-4394.18')",
};

test("basic", async ({ page }) => {
    await page.route("**/api/datasets/*/display?to_ext=json", async (route) => {
        const url = route.request().url();
        const match = url.match(/datasets\/([^/]+)\/display\?to_ext=json$/);
        const NAME = match ? match[1] : "UNKNOWN";
        const DATASET_DETAILS = await import(`./test-data/1.${NAME}.json`, { assert: { type: "json" } });
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(DATASET_DETAILS.default),
        });
    });
    for (const [name, selector] of Object.entries(TESTS)) {
        await page.goto(`http://localhost:8080?dataset_id=${name}`);
        await page.waitForSelector(selector);
        await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio });
    }
});
