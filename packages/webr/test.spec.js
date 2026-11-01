import { test, expect } from "@playwright/test";

test("starts R 4.6 on the PostMessage channel", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#app")).toHaveText(/^R version 4\.6\.0/, { timeout: 90_000 });
    expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe("undefined");
});
