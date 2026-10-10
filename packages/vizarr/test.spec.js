import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = "Images.ome.zarr";
const REMOTE = "https://zarr.example.org";
const maxDiffPixelRatio = 0.05;

const DATASETS = {
    stored: { state: "ok", extension: "ome_zarr", metadata_store_root: STORE },
    deferred: { state: "deferred", extension: "ome_zarr", sources: [{ source_uri: `${REMOTE}/${STORE}` }] },
};

/** Answers a request for a file of the store, as Galaxy or a remote host serves it. */
async function serveStore(route, path) {
    const file = join(__dirname, "test-data", path);
    if (existsSync(file)) {
        await route.fulfill({ status: 200, body: readFileSync(file) });
    } else {
        await route.fulfill({ status: 404, body: "" });
    }
}

test("basic", async ({ page }) => {
    await page.route("**/api/datasets/*", async (route) => {
        const name = new URL(route.request().url()).pathname.split("/").pop();
        const dataset = DATASETS[name];
        if (!dataset) {
            return route.continue();
        }
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ id: name, name: STORE, ...dataset }),
        });
    });
    await page.route("**/datasets/stored/display/**", (route) =>
        serveStore(route, new URL(route.request().url()).pathname.split("/display/")[1]),
    );
    await page.route(`${REMOTE}/**`, (route) => serveStore(route, new URL(route.request().url()).pathname));
    for (const name of Object.keys(DATASETS)) {
        const chunk = page.waitForResponse((response) => response.url().endsWith(`${STORE}/s0/0/0/0/0/0`));
        await page.goto(`/?dataset_id=${name}`);
        expect((await chunk).status()).toBe(200);
        await expect(page.locator("canvas")).toBeVisible();
        await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio });
    }
});
