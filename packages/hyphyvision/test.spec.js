import { test, expect } from "@playwright/test";

const maxDiffPixelRatio = 0.03;

test("basic", async ({ page }) => {
    await page.goto("http://localhost:8080/");
    await expect(page).toHaveScreenshot("1.png", { maxDiffPixelRatio });
});
