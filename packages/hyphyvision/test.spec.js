import { test, expect } from "@playwright/test";

const maxDiffPixelRatio = 0.03;

test("basic", async ({ page }) => {
    await page.goto("http://localhost:8080/");
    await page.waitForSelector("span:text('sequences in the alignment')");
    await expect(page).toHaveScreenshot("1.png", { maxDiffPixelRatio });
});
