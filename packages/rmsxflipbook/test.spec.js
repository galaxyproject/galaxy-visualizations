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
    const screenshot = await page.locator("#molstarViewport").screenshot();
    const imageUrl = `data:image/png;base64,${screenshot.toString("base64")}`;
    return page.evaluate(async (source) => {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", reject, { once: true });
            image.src = source;
        });
        const width = Math.max(1, image.naturalWidth);
        const height = Math.max(1, image.naturalHeight);
        const probe = document.createElement("canvas");
        probe.width = width;
        probe.height = height;
        const context = probe.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        const yStart = Math.floor(height * 0.15);
        const yEnd = Math.floor(height * 0.8);
        const columnCounts = new Uint32Array(width);
        const columnYTotals = new Float64Array(width);

        for (let y = yStart; y < yEnd; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const pixel = (y * width + x) * 4;
                const red = pixels[pixel];
                const green = pixels[pixel + 1];
                const blue = pixels[pixel + 2];
                const maximum = Math.max(red, green, blue);
                const minimum = Math.min(red, green, blue);
                if (maximum - minimum > 18 && minimum < 210) {
                    columnCounts[x] += 1;
                    columnYTotals[x] += y;
                }
            }
        }

        const clusters = [];
        const addCluster = (minX, maxX) => {
            let coloredPixels = 0;
            let yTotal = 0;
            for (let x = minX; x <= maxX; x += 1) {
                coloredPixels += columnCounts[x];
                yTotal += columnYTotals[x];
            }
            if (maxX - minX >= 4 && coloredPixels >= 30) {
                clusters.push({
                    centerX: (minX + maxX) / 2,
                    centerY: yTotal / coloredPixels,
                    maxX,
                    minX,
                });
            }
        };

        let start = -1;
        let lastColored = -1;
        for (let x = 0; x < width; x += 1) {
            if (columnCounts[x] >= 2) {
                start = start < 0 ? x : start;
                lastColored = x;
            } else if (start >= 0 && x - lastColored > 1) {
                addCluster(start, lastColored);
                start = -1;
                lastColored = -1;
            }
        }
        if (start >= 0) {
            addCluster(start, lastColored);
        }

        return { clusters, height, width };
    }, imageUrl);
}

function expectNineClustersInOneRow({ clusters, height }) {
    expect(clusters).toHaveLength(9);
    expect(
        Math.max(...clusters.map(({ centerY }) => centerY)) - Math.min(...clusters.map(({ centerY }) => centerY)),
    ).toBeLessThan(height * 0.08);
    for (let index = 1; index < clusters.length; index += 1) {
        expect(clusters[index].minX - clusters[index - 1].maxX).toBeGreaterThan(2);
    }
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
    await expect(page.locator("#molstarViewport")).toHaveScreenshot("example.png", {
        maxDiffPixelRatio: 0.07,
        timeout: 20000,
    });
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
    expectNineClustersInOneRow(await renderedProteinClusters(page));

    await page.getByText("Rotation", { exact: true }).click();
    await page.getByTestId("molstar-rotation-y-number").fill("45");
    await page.waitForTimeout(250);
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await page.waitForTimeout(2000);
    expectNineClustersInOneRow(await renderedProteinClusters(page));
});

test("dev mode loads the bundled example manifest without a dataset id", async ({ page }) => {
    await page.goto("http://localhost:5173");
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await expect(page.getByTestId("molstar-slice-chip")).toHaveCount(9);
    await expect(page.locator("#status")).not.toHaveClass(/error/);
});
