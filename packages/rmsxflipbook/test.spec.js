import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
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

async function renderedProteinClusters(page) {
    return page.locator("#molstarViewport canvas").evaluate((source) => {
        const width = Math.max(1, source.clientWidth);
        const height = Math.max(1, source.clientHeight);
        const probe = document.createElement("canvas");
        probe.width = width;
        probe.height = height;
        const context = probe.getContext("2d", { willReadFrequently: true });
        context.drawImage(source, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        const yStart = Math.floor(height * 0.15);
        const yEnd = Math.floor(height * 0.8);
        const mask = new Uint8Array(width * height);

        for (let y = yStart; y < yEnd; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const pixel = (y * width + x) * 4;
                const red = pixels[pixel];
                const green = pixels[pixel + 1];
                const blue = pixels[pixel + 2];
                const maximum = Math.max(red, green, blue);
                const minimum = Math.min(red, green, blue);
                if (maximum - minimum > 18 && minimum < 210) {
                    mask[y * width + x] = 1;
                }
            }
        }

        const expanded = new Uint8Array(width * height);
        const radius = 3;
        for (let y = yStart; y < yEnd; y += 1) {
            for (let x = 0; x < width; x += 1) {
                if (!mask[y * width + x]) {
                    continue;
                }
                for (let dy = -radius; dy <= radius; dy += 1) {
                    const yy = y + dy;
                    if (yy < yStart || yy >= yEnd) {
                        continue;
                    }
                    for (let dx = -radius; dx <= radius; dx += 1) {
                        const xx = x + dx;
                        if (xx >= 0 && xx < width) {
                            expanded[yy * width + xx] = 1;
                        }
                    }
                }
            }
        }

        const clusters = [];
        for (let y = yStart; y < yEnd; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const origin = y * width + x;
                if (!expanded[origin]) {
                    continue;
                }
                const pending = [origin];
                expanded[origin] = 0;
                let cursor = 0;
                let minX = x;
                let maxX = x;
                let minY = y;
                let maxY = y;

                while (cursor < pending.length) {
                    const index = pending[cursor];
                    cursor += 1;
                    const currentX = index % width;
                    const currentY = Math.floor(index / width);
                    minX = Math.min(minX, currentX);
                    maxX = Math.max(maxX, currentX);
                    minY = Math.min(minY, currentY);
                    maxY = Math.max(maxY, currentY);
                    const neighbors = [index - 1, index + 1, index - width, index + width];
                    for (const next of neighbors) {
                        const nextX = next % width;
                        const nextY = Math.floor(next / width);
                        if (
                            nextX < 0 ||
                            nextX >= width ||
                            nextY < yStart ||
                            nextY >= yEnd ||
                            !expanded[next] ||
                            Math.abs(nextX - currentX) + Math.abs(nextY - currentY) !== 1
                        ) {
                            continue;
                        }
                        expanded[next] = 0;
                        pending.push(next);
                    }
                }

                if (pending.length >= 100 && maxX - minX >= 5 && maxY - minY >= 5) {
                    clusters.push({
                        centerX: (minX + maxX) / 2,
                        centerY: (minY + maxY) / 2,
                        maxX,
                        minX,
                    });
                }
            }
        }

        clusters.sort((left, right) => left.centerX - right.centerX);
        return { clusters, height, width };
    });
}

async function expectStatusError(page, message) {
    const status = page.locator("#status");
    await expect(status).toHaveClass(/error/);
    await expect(status).toContainText(message);
}

test("shows an error when Galaxy does not provide a dataset id", async ({ page }) => {
    await page.goto("http://localhost:5173?dataset_id=");
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

test("renders the flipbook viewer for a valid manifest", async ({ page }) => {
    const manifest = readFileSync(join(__dirname, "test-data", "example.rmsx.json"));
    await routeDatasetDisplay(page, async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: manifest });
    });

    await page.goto("http://localhost:5173?dataset_id=example");
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await expect(page.getByTestId("molstar-slice-chip")).toHaveCount(9);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(2000);
    await expect(page.locator("#molstarViewport")).toHaveScreenshot("example.png", { maxDiffPixelRatio: 0.07 });
});

test("renders nine real multi-chain protease timepoints in one row", async ({ page }) => {
    const manifest = readFileSync(join(__dirname, "test-data", "protease-multichain.rmsx.json"));
    await routeDatasetDisplay(page, async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: manifest });
    });

    await page.goto("http://localhost:5173?dataset_id=protease-multichain");
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await expect(page.getByTestId("molstar-slice-chip")).toHaveCount(9);
    await expect(page.getByTestId("molstar-columns-number")).toHaveValue("9");
    await page.mouse.move(0, 0);
    await page.waitForTimeout(2000);
    await expect(page.locator("#molstarViewport")).toHaveScreenshot("protease-multichain-row.png", {
        maxDiffPixelRatio: 0.07,
        timeout: 20000,
    });
    const { clusters, height } = await renderedProteinClusters(page);
    expect(clusters).toHaveLength(9);
    expect(
        Math.max(...clusters.map(({ centerY }) => centerY)) - Math.min(...clusters.map(({ centerY }) => centerY)),
    ).toBeLessThan(height * 0.08);
    for (let index = 1; index < clusters.length; index += 1) {
        expect(clusters[index].minX - clusters[index - 1].maxX).toBeGreaterThan(2);
    }
});

test("dev mode loads the bundled example manifest without a dataset id", async ({ page }) => {
    await page.goto("http://localhost:5173");
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await expect(page.getByTestId("molstar-slice-chip")).toHaveCount(9);
    await expect(page.locator("#status")).not.toHaveClass(/error/);
});
