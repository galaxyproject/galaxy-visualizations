import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const maxDiffPixelRatio = 0.07;

const TESTS = {
    "test-intra": { file: "test-intra.json", extension: "json" },
    "test-inter": { file: "test-inter.json", extension: "json" },
};

test("basic", async ({ page }) => {
    await page.route("**/api/datasets/**", async (route) => {
        const url = new URL(route.request().url());
        const match = url.pathname.match(/\/api\/datasets\/([^/]+)(\/display)?$/);
        const name = match?.[1];
        const fixture = name ? TESTS[name] : null;
        if (!fixture) {
            return route.continue();
        }
        if (match[2] === "/display") {
            const body = readFileSync(join(__dirname, "test-data", fixture.file), "utf8");
            await route.fulfill({ status: 200, contentType: "application/json", body });
        } else {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ extension: fixture.extension }),
            });
        }
    });

    for (const name of Object.keys(TESTS)) {
        await page.goto(`?dataset_id=${name}`);
        const drawing = page.frameLocator("#varri-viewer").locator("#rendering-canvas svg");
        await expect(drawing).toBeVisible({ timeout: 90000 });
        let previous;
        await expect
            .poll(
                async () => {
                    const current = await drawing.innerHTML();
                    const settled = current === previous;
                    previous = current;
                    return settled;
                },
                { intervals: [500], timeout: 30000 },
            )
            .toBe(true);
        await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio });
    }
});
