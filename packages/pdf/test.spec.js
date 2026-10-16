import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function inkedPages(page) {
    return page.locator(".pdf-page canvas").evaluateAll(
        (canvases) =>
            canvases.filter((canvas) => {
                const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
                return data.some((value, i) => i % 4 !== 3 && value < 128);
            }).length,
    );
}

test("basic", async ({ page }) => {
    await page.route("**/api/datasets/*/display", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/pdf",
            body: readFileSync(join(__dirname, "test-data", "1.pdf")),
        }),
    );
    await page.goto("/?dataset_id=1");
    await expect(page.locator(".pdf-page")).toHaveCount(2);
    await expect(page.locator(".pdf-page.pdf-rendered")).toHaveCount(2);
    await expect(page.locator("#pdf-page")).toHaveText("Page 1 / 2");
    await expect(page.locator("#pdf-status")).toBeHidden();
    await expect(page.locator("#pdf-error")).toBeHidden();
    expect(await inkedPages(page)).toBe(2);
});

test("zooms and fits the width", async ({ page }) => {
    await page.route("**/api/datasets/*/display", (route) =>
        route.fulfill({ status: 200, body: readFileSync(join(__dirname, "test-data", "1.pdf")) }),
    );
    await page.goto("/?dataset_id=1");
    const first = page.locator(".pdf-page").first();
    const width = async () => (await first.boundingBox()).width;
    await expect(page.locator(".pdf-page.pdf-rendered")).toHaveCount(2);
    await expect(page.locator("#pdf-zoom")).toHaveText("125%");
    const initial = await width();
    await page.click("#pdf-zoom-in");
    await expect(page.locator("#pdf-zoom")).toHaveText("156%");
    await expect.poll(width).toBeGreaterThan(initial);
    await page.click("#pdf-fit");
    const pane = await page.locator("#pdf-pages").evaluate((element) => element.clientWidth);
    await expect.poll(width).toBeCloseTo(pane - 32, 0);
});

test("reports a failed fetch", async ({ page }) => {
    await page.route("**/api/datasets/*/display", (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto("/?dataset_id=missing");
    await expect(page.locator("#pdf-error")).toContainText("Could not fetch dataset: HTTP 404");
});

test("reports a file that is not a PDF", async ({ page }) => {
    await page.route("**/api/datasets/*/display", (route) => route.fulfill({ status: 200, body: "not a pdf" }));
    await page.goto("/?dataset_id=text");
    await expect(page.locator("#pdf-error")).toContainText("Could not open PDF");
});
