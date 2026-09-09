import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIEWER_URL = `http://localhost:${process.env.PLAYWRIGHT_PORT || 5173}`;
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
                    coloredPixels,
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
    const widths = clusters.map(({ maxX, minX }) => maxX - minX + 1).sort((left, right) => left - right);
    const pixelCounts = clusters.map(({ coloredPixels }) => coloredPixels).sort((left, right) => left - right);
    const medianWidth = widths[Math.floor(widths.length / 2)];
    const medianPixels = pixelCounts[Math.floor(pixelCounts.length / 2)];
    clusters.forEach(({ coloredPixels, maxX, minX }) => {
        expect(maxX - minX + 1).toBeGreaterThanOrEqual(medianWidth * 0.6);
        expect(coloredPixels).toBeGreaterThanOrEqual(medianPixels * 0.45);
    });
}

async function renderedAnalysisLaneClusters(page, lane) {
    const geometry = await lane.evaluate((element) => {
        const viewport = document.querySelector("#molstarViewport").getBoundingClientRect();
        const laneRect = element.getBoundingClientRect();
        return {
            anchors: [...element.querySelectorAll(".analysis-slice-anchor")].map((anchor) => {
                const rect = anchor.getBoundingClientRect();
                return rect.left + rect.width / 2 - viewport.left;
            }),
            height: laneRect.height,
            width: laneRect.width,
            x: laneRect.left - viewport.left,
            y: laneRect.top - viewport.top,
        };
    });
    const screenshot = await page.locator("#molstarViewport").screenshot();
    const source = `data:image/png;base64,${screenshot.toString("base64")}`;
    return page.evaluate(
        async ({ geometry, source }) => {
            const image = new Image();
            await new Promise((resolve, reject) => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", reject, { once: true });
                image.src = source;
            });
            const probe = document.createElement("canvas");
            probe.width = image.naturalWidth;
            probe.height = image.naturalHeight;
            const context = probe.getContext("2d", { willReadFrequently: true });
            context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
            const xStart = Math.max(0, Math.floor(geometry.x));
            const xEnd = Math.min(probe.width, Math.ceil(geometry.x + geometry.width));
            const yStart = Math.max(0, Math.floor(geometry.y));
            const yEnd = Math.min(probe.height, Math.ceil(geometry.y + geometry.height));
            const columns = [];
            for (let x = xStart; x < xEnd; x += 1) {
                let count = 0;
                let minY = Infinity;
                let maxY = -Infinity;
                let xTotal = 0;
                let yTotal = 0;
                for (let y = yStart; y < yEnd; y += 1) {
                    const offset = (y * probe.width + x) * 4;
                    const red = pixels[offset];
                    const green = pixels[offset + 1];
                    const blue = pixels[offset + 2];
                    const maximum = Math.max(red, green, blue);
                    const minimum = Math.min(red, green, blue);
                    if (maximum - minimum > 18 && minimum < 220) {
                        count += 1;
                        minY = Math.min(minY, y);
                        maxY = Math.max(maxY, y);
                        xTotal += x;
                        yTotal += y;
                    }
                }
                columns.push({ count, maxY, minY, x, xTotal, yTotal });
            }
            const clusters = [];
            let current = null;
            let emptyColumns = 0;
            const finish = () => {
                if (current && current.pixels >= 20 && current.maxX - current.minX >= 3) {
                    clusters.push({
                        centerX: current.xTotal / current.pixels,
                        centerY: current.yTotal / current.pixels,
                        height: current.maxY - current.minY + 1,
                        maxX: current.maxX,
                        minX: current.minX,
                        pixels: current.pixels,
                    });
                }
                current = null;
                emptyColumns = 0;
            };
            columns.forEach((column) => {
                if (column.count > 0) {
                    if (!current) {
                        current = {
                            maxX: column.x,
                            maxY: column.maxY,
                            minX: column.x,
                            minY: column.minY,
                            pixels: 0,
                            xTotal: 0,
                            yTotal: 0,
                        };
                    }
                    current.maxX = column.x;
                    current.maxY = Math.max(current.maxY, column.maxY);
                    current.minY = Math.min(current.minY, column.minY);
                    current.pixels += column.count;
                    current.xTotal += column.xTotal;
                    current.yTotal += column.yTotal;
                    emptyColumns = 0;
                } else if (current) {
                    emptyColumns += 1;
                    if (emptyColumns > 2) {
                        finish();
                    }
                }
            });
            finish();
            const anchorSpacing =
                geometry.anchors.length > 1 ? Math.abs(geometry.anchors[1] - geometry.anchors[0]) : geometry.width;
            return {
                ...geometry,
                clusters: clusters.filter(
                    (cluster) =>
                        Math.min(...geometry.anchors.map((anchor) => Math.abs(cluster.centerX - anchor))) <
                        anchorSpacing * 0.45,
                ),
            };
        },
        { geometry, source },
    );
}

function expectNineAnchoredAnalysisClusters(result, tolerance = 6) {
    const slotWidth = result.anchors.length > 1 ? Math.abs(result.anchors[1] - result.anchors[0]) : result.width;
    expect(result.clusters).toHaveLength(9);
    result.clusters.forEach((cluster, index) => {
        expect(Math.abs(cluster.centerX - result.anchors[index])).toBeLessThanOrEqual(tolerance);
        const width = cluster.maxX - cluster.minX + 1;
        // Either dimension can constrain a rotated molecule, particularly on mobile.
        expect(Math.max(cluster.height / result.height, width / slotWidth)).toBeGreaterThanOrEqual(0.45);
        expect(width / slotWidth).toBeLessThanOrEqual(0.95);
        expect(cluster.height / result.height).toBeLessThanOrEqual(0.85);
    });
}

async function analysisGeometry(page) {
    return page.getByTestId("rmsx-analysis-chain-panel").evaluateAll((panels) =>
        panels.map((panel) => {
            const pageX = (canvas, value) => {
                const rect = canvas.getBoundingClientRect();
                return rect.left + Number(canvas.dataset[value]);
            };
            const pageY = (canvas, value) => {
                const rect = canvas.getBoundingClientRect();
                return rect.top + Number(canvas.dataset[value]);
            };
            const rmsd = panel.querySelector(".analysis-rmsd");
            const heatmap = panel.querySelector(".analysis-heatmap");
            const rmsf = panel.querySelector(".analysis-rmsf");
            const lane = panel.querySelector(".analysis-structure-lane");
            const laneAnchors = [...lane.querySelectorAll(".analysis-slice-anchor")].map((anchor) => {
                const rect = anchor.getBoundingClientRect();
                return rect.left + rect.width / 2;
            });
            const heatmapAnchors = JSON.parse(heatmap.dataset.sliceAnchors).map(
                (x) => heatmap.getBoundingClientRect().left + x,
            );
            return {
                chain: panel.dataset.chain,
                heatmapBottom: pageY(heatmap, "plotBottom"),
                heatmapLeft: pageX(heatmap, "plotLeft"),
                heatmapRight: pageX(heatmap, "plotRight"),
                heatmapTop: pageY(heatmap, "plotTop"),
                laneAnchors,
                heatmapAnchors,
                rmsdLeft: pageX(rmsd, "plotLeft"),
                rmsdRight: pageX(rmsd, "plotRight"),
                rmsfBottom: pageY(rmsf, "plotBottom"),
                rmsfTop: pageY(rmsf, "plotTop"),
            };
        }),
    );
}

async function canvasColorCount(canvas) {
    return canvas.evaluate((element) => {
        const context = element.getContext("2d", { willReadFrequently: true });
        const pixels = context.getImageData(0, 0, element.width, element.height).data;
        const colors = new Set();
        for (let offset = 0; offset < pixels.length; offset += 16) {
            const alpha = pixels[offset + 3];
            if (alpha < 128) {
                continue;
            }
            const red = Math.round(pixels[offset] / 16);
            const green = Math.round(pixels[offset + 1] / 16);
            const blue = Math.round(pixels[offset + 2] / 16);
            colors.add(`${red}:${green}:${blue}`);
        }
        return colors.size;
    });
}

async function expectStatusError(page, message) {
    const status = page.locator("#status");
    await expect(status).toHaveClass(/error/);
    await expect(status).toContainText(message);
}

test("shows an error when Galaxy does not provide a dataset id", async ({ page }) => {
    await page.goto(`${VIEWER_URL}?dataset_id=`);
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

    await page.goto(`${VIEWER_URL}?dataset_id=not-rmsx`);
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

    await page.goto(`${VIEWER_URL}?dataset_id=missing-fields`);
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

    await page.goto(`${VIEWER_URL}?dataset_id=http-error`);
    await expectStatusError(page, "Could not load RMSX manifest from Galaxy dataset");
});

test("renders the flipbook viewer for a valid manifest", async ({ page }) => {
    const manifest = readFileSync(join(__dirname, "test-data", "example.rmsx.json"));
    await routeDatasetDisplay(page, async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: manifest });
    });

    await page.goto(`${VIEWER_URL}?dataset_id=example`);
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await expect(page.getByTestId("molstar-slice-chip")).toHaveCount(9);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(2000);
    await expect(page.locator("#molstarViewport")).toHaveScreenshot("example.png", {
        maxDiffPixelRatio: 0.07,
        timeout: 20000,
    });
    await page.getByTestId("heatmap-tab").click();
    await expect(page.getByTestId("rmsx-heatmap-view")).toBeVisible();
    await expect(page.getByTestId("rmsx-chain-heatmap")).toHaveCount(1);
    await expect(page.getByTestId("rmsx-chain-heatmap")).toHaveAttribute("data-chain", "7");
    await expect(page.getByTestId("rmsx-heatmap-canvas")).toHaveAttribute("data-rendered-cells", "684");
    await expect(page.locator("#heatmapSelection")).toContainText("Chain 7");
    await page.getByTestId("structures-tab").click();
    await expect(page.locator("#molstarViewport")).toBeVisible();
});

test("renders nine real multi-chain protease timepoints in one row", async ({ page }, testInfo) => {
    const manifest = readFileSync(join(__dirname, "test-data", "protease-multichain.rmsx.json"));
    await routeDatasetDisplay(page, async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: manifest });
    });

    await page.goto(`${VIEWER_URL}?dataset_id=protease-multichain`);
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await expect(page.getByTestId("molstar-slice-chip")).toHaveCount(9);
    await expect(page.getByTestId("molstar-columns-number")).toHaveValue("9");
    const spacingRange = page.getByTestId("molstar-spacing-range");
    const spacingNumber = page.getByTestId("molstar-spacing-number");
    await expect(spacingRange).toHaveAttribute("min", "0.3");
    await expect(spacingRange).toHaveAttribute("max", "0.7");
    await expect(spacingRange).toHaveAttribute("step", "0.01");
    await expect(spacingNumber).toHaveValue("0.5");
    await page.mouse.move(0, 0);
    await page.waitForTimeout(2000);
    await expect(page.locator("#molstarViewport")).toHaveScreenshot("protease-multichain-row.png", {
        maxDiffPixelRatio: 0.07,
        timeout: 20000,
    });
    const beforeDrag = await renderedProteinClusters(page);
    expectNineClustersInOneRow(beforeDrag);

    await page.getByText("Rotation", { exact: true }).click();
    await page.getByTestId("molstar-rotation-z-number").fill("90");
    await page.waitForTimeout(400);
    for (const spacing of ["0.3", "0.7", "0.5"]) {
        await spacingNumber.fill(spacing);
        await expect(page.locator("#status")).toContainText(/Loading|Rendering/, { timeout: 5000 });
        await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
        await page.waitForTimeout(700);
        expectNineClustersInOneRow(await renderedProteinClusters(page));
    }
    for (const spacing of ["0.34", "0.31", "0.38", "0.3"]) {
        await spacingNumber.fill(spacing);
        await page.waitForTimeout(140);
    }
    await expect(page.locator("#molstarViewport")).toHaveAttribute("data-scene-reloading", "true");
    await expect(page.locator("#molstarViewport")).toHaveAttribute("data-scene-reloading", "false", {
        timeout: 90000,
    });
    await expect.poll(async () => (await renderedProteinClusters(page)).clusters.length, { timeout: 15000 }).toBe(9);
    expectNineClustersInOneRow(await renderedProteinClusters(page));
    await spacingNumber.fill("0.5");
    await expect(page.locator("#molstarViewport")).toHaveAttribute("data-scene-reloading", "true");
    await expect(page.locator("#molstarViewport")).toHaveAttribute("data-scene-reloading", "false", {
        timeout: 90000,
    });
    await page.getByTestId("molstar-rotation-z-number").fill("0");
    await page.waitForTimeout(400);
    // A rotation can rebuild the scene; software WebGL on CI may take longer
    // than a fixed delay to paint the replacement canvas.
    await expect(async () => {
        await expect(page.locator("#molstarViewport")).toHaveAttribute("data-scene-reloading", "false");
        expectNineClustersInOneRow(await renderedProteinClusters(page));
    }).toPass({ timeout: 20000 });
    await page.getByText("Rotation", { exact: true }).click();

    const viewport = page.locator("#molstarViewport");
    const canvas = viewport.locator("canvas");
    await canvas.evaluate((element) => element.setAttribute("data-drag-regression", "original-canvas"));
    const box = await viewport.boundingBox();
    expect(box).not.toBeNull();
    const start = {
        x: box.x + box.width * 0.42,
        y: box.y + box.height * 0.5,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 90, start.y + 60, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId("molstar-rotation-y-number")).not.toHaveValue("0");
    await page.waitForTimeout(500);

    await expect(canvas).toHaveAttribute("data-drag-regression", "original-canvas");
    const afterDrag = await renderedProteinClusters(page);
    expectNineClustersInOneRow(afterDrag);
    const beforeSpan = beforeDrag.clusters.at(-1).centerX - beforeDrag.clusters[0].centerX;
    const afterSpan = afterDrag.clusters.at(-1).centerX - afterDrag.clusters[0].centerX;
    expect(Math.abs(afterSpan - beforeSpan)).toBeLessThan(beforeDrag.width * 0.03);

    await page.getByText("Rotation", { exact: true }).click();
    await page.getByTestId("molstar-rotation-y-number").fill("45");
    await page.waitForTimeout(250);
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await page.waitForTimeout(2000);
    expectNineClustersInOneRow(await renderedProteinClusters(page));

    await page.getByTestId("heatmap-tab").click();
    await expect(page.getByTestId("rmsx-heatmap-view")).toBeVisible();
    const heatmapPanels = page.getByTestId("rmsx-chain-heatmap");
    await expect(heatmapPanels).toHaveCount(2);
    await expect(heatmapPanels.nth(0)).toHaveAttribute("data-chain", "A");
    await expect(heatmapPanels.nth(1)).toHaveAttribute("data-chain", "B");
    const heatmapCanvases = page.getByTestId("rmsx-heatmap-canvas");
    await expect(heatmapCanvases).toHaveCount(2);
    await expect(heatmapCanvases.nth(0)).toHaveAttribute("data-rendered-cells", "891");
    await expect(heatmapCanvases.nth(1)).toHaveAttribute("data-rendered-cells", "891");
    await expect(heatmapCanvases.nth(0)).toHaveAttribute(
        "data-color-min",
        await heatmapCanvases.nth(1).getAttribute("data-color-min"),
    );
    await expect(heatmapCanvases.nth(0)).toHaveAttribute(
        "data-color-max",
        await heatmapCanvases.nth(1).getAttribute("data-color-max"),
    );

    const heatmapBox = await heatmapCanvases.nth(0).boundingBox();
    expect(heatmapBox).not.toBeNull();
    await page.mouse.click(heatmapBox.x + heatmapBox.width * 0.55, heatmapBox.y + heatmapBox.height * 0.55);
    await expect(page.locator("#heatmapSelection")).toContainText("Chain A · Residue");
    await expect(page.getByTestId("rmsx-heatmap-view")).toHaveAttribute("data-marker-records", "9", {
        timeout: 30000,
    });
    await expect(page.locator('[data-testid="molstar-slice-chip"][aria-current="true"]')).toHaveCount(1);

    // Reload before the visual baselines so they represent the clean default
    // Analysis layout rather than the marker and rotation interaction above.
    await page.goto(`${VIEWER_URL}?dataset_id=protease-multichain`);
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await page.setViewportSize({ width: 2000, height: 1100 });
    await page.getByTestId("analysis-tab").click();
    await expect(page.getByTestId("molstar-report")).toHaveClass(/analysis-view-active/);
    await expect(page.getByTestId("rmsx-analysis-view")).toBeVisible();
    await expect(page.getByTestId("rmsx-analysis-chain-panel")).toHaveCount(2);
    await expect(page.getByTestId("rmsx-analysis-rmsd")).toHaveCount(2);
    await expect(page.getByTestId("rmsx-analysis-rmsf")).toHaveCount(2);
    await expect(page.getByTestId("rmsx-analysis-heatmap")).toHaveCount(2);
    await expect(page.getByTestId("rmsx-analysis-chain-lane")).toHaveCount(2);
    await expect(page.getByTestId("rmsx-analysis-assembly-lane")).toBeVisible();
    await expect(page.getByTestId("molstar-spacing-range")).toBeDisabled();
    await expect(page.getByTestId("molstar-columns-number")).toBeDisabled();
    await expect(page.getByTestId("rmsx-analysis-chain-lane").nth(1)).toHaveAttribute("data-cluster-count", "9", {
        timeout: 120000,
    });
    await page.waitForTimeout(3000);

    const panelGeometry = await analysisGeometry(page);
    expect(panelGeometry.map(({ chain }) => chain)).toEqual(["A", "B"]);
    panelGeometry.forEach((geometry) => {
        expect(Math.abs(geometry.rmsdLeft - geometry.heatmapLeft)).toBeLessThanOrEqual(2);
        expect(Math.abs(geometry.rmsdRight - geometry.heatmapRight)).toBeLessThanOrEqual(2);
        expect(Math.abs(geometry.rmsfTop - geometry.heatmapTop)).toBeLessThanOrEqual(2);
        expect(Math.abs(geometry.rmsfBottom - geometry.heatmapBottom)).toBeLessThanOrEqual(2);
        geometry.laneAnchors.forEach((anchor, index) => {
            expect(Math.abs(anchor - geometry.heatmapAnchors[index])).toBeLessThanOrEqual(2);
        });
    });
    await expect(page.getByTestId("rmsx-analysis-rmsd").first()).toHaveAttribute("data-point-count", "2048");
    await expect(page.getByTestId("rmsx-analysis-rmsf").first()).toHaveAttribute("data-point-count", "99");
    await expect(page.getByTestId("rmsx-analysis-heatmap").first()).toHaveAttribute("data-rendered-cells", "891");
    expect(await canvasColorCount(page.getByTestId("rmsx-analysis-heatmap").first())).toBeGreaterThan(12);
    await expect(page).toHaveScreenshot("analysis-protease-2000x1100.png", {
        maxDiffPixelRatio: 0.07,
        timeout: 20000,
    });
    const chainLanes = page.getByTestId("rmsx-analysis-chain-lane");
    const assemblyLane = page.getByTestId("rmsx-analysis-assembly-lane");
    const chainAClustersBefore = await renderedAnalysisLaneClusters(page, chainLanes.nth(0));
    const chainBClustersBefore = await renderedAnalysisLaneClusters(page, chainLanes.nth(1));
    const assemblyClustersBefore = await renderedAnalysisLaneClusters(page, assemblyLane);
    expectNineAnchoredAnalysisClusters(chainAClustersBefore);
    expectNineAnchoredAnalysisClusters(chainBClustersBefore);
    expectNineAnchoredAnalysisClusters(assemblyClustersBefore);

    const analysisDragBox = await chainLanes.nth(0).boundingBox();
    expect(analysisDragBox).not.toBeNull();
    await page.mouse.move(
        analysisDragBox.x + analysisDragBox.width * 0.5,
        analysisDragBox.y + analysisDragBox.height * 0.5,
    );
    await page.mouse.down();
    await page.mouse.move(
        analysisDragBox.x + analysisDragBox.width * 0.5 + 70,
        analysisDragBox.y + analysisDragBox.height * 0.5 + 40,
        { steps: 6 },
    );
    await page.mouse.up();
    await page.waitForTimeout(600);
    expectNineAnchoredAnalysisClusters(await renderedAnalysisLaneClusters(page, chainLanes.nth(0)));
    expectNineAnchoredAnalysisClusters(await renderedAnalysisLaneClusters(page, chainLanes.nth(1)));
    expectNineAnchoredAnalysisClusters(await renderedAnalysisLaneClusters(page, assemblyLane));

    for (const viewportSize of [
        { height: 900, width: 1440 },
        { height: 993, width: 552 },
    ]) {
        await page.setViewportSize(viewportSize);
        await page.locator("#analysisView").evaluate((element) => {
            element.scrollTop = 0;
        });
        await page.waitForTimeout(350);
        const panels = await page
            .getByTestId("rmsx-analysis-chain-panel")
            .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
        expect(panels[1].top).toBeGreaterThanOrEqual(panels[0].bottom + 10);
        const analysisBounds = await page
            .getByTestId("rmsx-analysis-view")
            .evaluate((element) => element.getBoundingClientRect().toJSON());
        panels.forEach((panel) => {
            expect(panel.left).toBeGreaterThanOrEqual(analysisBounds.left - 1);
            expect(panel.right).toBeLessThanOrEqual(analysisBounds.right + 1);
        });
        const laneHeights = await page
            .locator(".analysis-structure-lane")
            .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
        expect(laneHeights[2] / laneHeights[0]).toBeGreaterThanOrEqual(1.5);
        expect(laneHeights[2] / laneHeights[0]).toBeLessThanOrEqual(1.7);
        const tolerance = viewportSize.width <= 600 ? 4 : 2;
        for (const geometry of await analysisGeometry(page)) {
            expect(Math.abs(geometry.rmsdLeft - geometry.heatmapLeft)).toBeLessThanOrEqual(tolerance);
            expect(Math.abs(geometry.rmsdRight - geometry.heatmapRight)).toBeLessThanOrEqual(tolerance);
            expect(Math.abs(geometry.rmsfTop - geometry.heatmapTop)).toBeLessThanOrEqual(tolerance);
            expect(Math.abs(geometry.rmsfBottom - geometry.heatmapBottom)).toBeLessThanOrEqual(tolerance);
            geometry.laneAnchors.forEach((anchor, index) => {
                expect(Math.abs(anchor - geometry.heatmapAnchors[index])).toBeLessThanOrEqual(tolerance);
            });
        }
        await expect(page).toHaveScreenshot(`analysis-protease-${viewportSize.width}x${viewportSize.height}.png`, {
            maxDiffPixelRatio: 0.07,
            timeout: 20000,
        });
        await page.screenshot({ path: testInfo.outputPath(`analysis-${viewportSize.width}.png`) });
        for (const lane of await page.locator(".analysis-structure-lane").all()) {
            await lane.scrollIntoViewIfNeeded();
            await page.waitForTimeout(200);
            const result = await renderedAnalysisLaneClusters(page, lane);
            expectNineAnchoredAnalysisClusters(result, viewportSize.width <= 600 ? 8 : 6);
        }
    }
    for (const lane of await page.locator(".analysis-structure-lane").all()) {
        expect(Number(await lane.getAttribute("data-max-anchor-error"))).toBeLessThanOrEqual(3);
    }

    await page.getByTestId("structures-tab").click();
    await expect(page.getByTestId("molstar-spacing-range")).toBeEnabled();
    await expect(page.getByTestId("molstar-columns-number")).toBeEnabled();
    await expect(page.locator("#status")).not.toHaveClass(/error/);
});

test("renders a compact Analysis fallback for legacy manifests without metrics", async ({ page }) => {
    const manifest = JSON.parse(readFileSync(join(__dirname, "test-data", "example.rmsx.json"), "utf8"));
    delete manifest.analysis;
    manifest.slices.forEach((slice) => {
        delete slice.time;
        delete slice.chainAtomRanges;
    });
    await routeDatasetDisplay(page, async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) });
    });

    await page.goto(`${VIEWER_URL}?dataset_id=legacy-example`);
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await page.getByTestId("analysis-tab").click();
    const panel = page.getByTestId("rmsx-analysis-chain-panel");
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveAttribute("data-metrics", "missing");
    await expect(page.getByTestId("rmsx-analysis-rmsd")).toHaveCount(0);
    await expect(page.getByTestId("rmsx-analysis-rmsf")).toHaveCount(0);
    await expect(page.getByTestId("rmsx-analysis-heatmap")).toHaveAttribute("data-rendered-cells", "684");
    await expect(page.getByTestId("rmsx-analysis-assembly")).toBeHidden();
    const lane = page.getByTestId("rmsx-analysis-chain-lane");
    await expect(lane).toHaveAttribute("data-cluster-count", "9", { timeout: 30000 });
    await expect(page.getByTestId("molstar-spacing-range")).toBeDisabled();
    expect(Number(await lane.getAttribute("data-max-anchor-error"))).toBeLessThanOrEqual(3);
});

test("dev mode loads the bundled example manifest without a dataset id", async ({ page }) => {
    await page.goto(`${VIEWER_URL}`);
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await expect(page.getByTestId("molstar-slice-chip")).toHaveCount(9);
    await expect(page.locator("#status")).not.toHaveClass(/error/);
});

test("renders a fresh Galaxy multi-chain job with actual slice times", async ({ page }, testInfo) => {
    const manifest = JSON.parse(readFileSync(join(__dirname, "test-data", "protease-galaxy.rmsx.json"), "utf8"));
    expect(manifest.analysis.chains.map((chain) => chain.id)).toEqual(["A", "B"]);
    expect(manifest.analysis.timeDomainNs[1]).toBeGreaterThan(manifest.analysis.timeDomainNs[0]);
    expect(manifest.analysis.chains.map((chain) => chain.rmsf.values.length)).toEqual([99, 99]);
    expect(manifest.slices[0].time.startFrame).toBe(0);
    expect(manifest.slices[8].time.endFrame).toBe(179);
    await routeDatasetDisplay(page, async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) });
    });
    await page.setViewportSize({ width: 2000, height: 1100 });
    await page.goto(`${VIEWER_URL}?dataset_id=protease-galaxy`);
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await page.getByTestId("analysis-tab").click();
    await expect(page.getByTestId("rmsx-analysis-chain-panel")).toHaveCount(2);
    await expect(page.getByTestId("rmsx-analysis-rmsd")).toHaveCount(2);
    await expect(page.getByTestId("rmsx-analysis-rmsf")).toHaveCount(2);
    for (const lane of await page.getByTestId("rmsx-analysis-chain-lane").all()) {
        await expect(lane).toHaveAttribute("data-cluster-count", "9", { timeout: 30000 });
    }
    await expect(page.getByTestId("rmsx-analysis-assembly")).toBeVisible();
    await expect(page.locator("#status")).not.toHaveClass(/error/);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: testInfo.outputPath("fresh-galaxy-before-assertions.png") });
    for (const lane of await page.getByTestId("rmsx-analysis-chain-lane").all()) {
        await expect(async () => {
            expectNineAnchoredAnalysisClusters(await renderedAnalysisLaneClusters(page, lane));
        }).toPass({ timeout: 30000 });
    }
    await expect(page).toHaveScreenshot("analysis-protease-galaxy.png", {
        maxDiffPixelRatio: 0.07,
        timeout: 20000,
    });
    await page.screenshot({ path: testInfo.outputPath("fresh-galaxy-analysis.png"), fullPage: true });
});
