import { test, expect } from "@playwright/test";

test("fasta viewer loads correctly", async ({ page }) => {
    await page.goto("http://localhost:5173/?format=fasta");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#seqviz-container")).toBeVisible();
    await page.waitForTimeout(2000);
    const messageElement = page.locator("#message");
    await expect(messageElement).toHaveText(/Sample sequence loaded.*fasta/i);
    await page.screenshot({ path: "test-data/fasta.png" });
});

test("genbank viewer loads correctly", async ({ page }) => {
    await page.goto("http://localhost:5173/?format=genbank");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#seqviz-container")).toBeVisible();
    await page.waitForTimeout(2000);
    const messageElement = page.locator("#message");
    await expect(messageElement).toHaveText(/Sample sequence loaded.*genbank/i);
});
