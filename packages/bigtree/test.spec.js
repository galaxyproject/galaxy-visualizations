import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function viewerState(page) {
    return page
        .frame({ url: /\/viewer\/index\.html/ })
        ?.evaluate(() => window.__BIG_TREE_VIEWER_APP_TEST__?.getState() ?? null);
}

test("basic", async ({ page }) => {
    await page.route("**/api/datasets/*/display", (route) =>
        route.fulfill({ status: 200, body: readFileSync(join(__dirname, "test-data", "1.newick"), "utf8") }),
    );
    await page.goto("/?dataset_id=1");
    await expect.poll(async () => (await viewerState(page))?.treeLoaded, { timeout: 30_000 }).toBe(true);
    await expect(page.locator("#bt-status")).toBeHidden();
    await expect(page.locator("#bt-error")).toBeHidden();
});

test("reports a failed fetch", async ({ page }) => {
    await page.route("**/api/datasets/*/display", (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto("/?dataset_id=missing");
    await expect(page.locator("#bt-error")).toContainText("Could not fetch dataset: HTTP 404");
});
