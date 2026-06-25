import { expect, test } from "@playwright/test";

const SCHEMA_VERSION = "flipbook-molstar-viewer/v1";

async function routeDatasetDisplay(page, handler) {
    await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (!url.pathname.includes("/api/datasets/") && !url.pathname.includes("/datasets/")) {
            return route.continue();
        }
        return handler(route, url);
    });
}

async function expectStatusError(page, message) {
    const status = page.locator("#status");
    await expect(status).toHaveClass(/error/);
    await expect(status).toContainText(message);
}

test("shows an error when Galaxy does not provide a dataset id", async ({ page }) => {
    await page.goto("http://localhost:5173");
    await expectStatusError(page, "No Galaxy dataset id was provided");
});

test("shows an error for non-RMSX JSON datasets", async ({ page }) => {
    await routeDatasetDisplay(page, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ hello: "world" }),
        });
    });

    await page.goto("http://localhost:5173?dataset_id=not-rmsx");
    await expectStatusError(page, "not an RMSX Flipbook manifest");
});

test("shows an error when the RMSX manifest is missing required fields", async ({ page }) => {
    await routeDatasetDisplay(page, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ schemaVersion: SCHEMA_VERSION }),
        });
    });

    await page.goto("http://localhost:5173?dataset_id=missing-fields");
    await expectStatusError(page, "RMSX manifest is missing required field");
});

test("shows an error when Galaxy dataset display requests fail", async ({ page }) => {
    await routeDatasetDisplay(page, async (route) => {
        await route.fulfill({
            status: 500,
            contentType: "text/plain",
            body: "boom",
        });
    });

    await page.goto("http://localhost:5173?dataset_id=http-error");
    await expectStatusError(page, "Could not load RMSX manifest from Galaxy dataset");
});
