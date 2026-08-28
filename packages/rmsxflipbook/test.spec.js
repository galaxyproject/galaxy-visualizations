import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = "flipbook-molstar-viewer/v1";

function makeTwoChainManifest(source) {
    const manifest = JSON.parse(source);
    const residues = manifest.residues;
    manifest.residues = residues.flatMap((residue) =>
        ["A", "B"].map((chain) => ({
            ...residue,
            chain,
            key: `${chain}:${residue.id}`,
            label: `${residue.id} / chain ${chain}`,
        })),
    );
    manifest.maskSummary.totalResidues = manifest.residues.length;
    Object.values(manifest.summaries).forEach((summary) => {
        summary.residueCount = manifest.residues.length;
    });
    manifest.slices = manifest.slices.map((slice) => {
        const lines = slice.pdb.split(/\r?\n/);
        const firstAtom = lines.findIndex((line) => line.startsWith("ATOM") || line.startsWith("HETATM"));
        const headers = lines.slice(0, firstAtom).filter((line) => !line.startsWith("END"));
        const atoms = lines.filter((line) => line.startsWith("ATOM") || line.startsWith("HETATM"));
        const chainAtoms = ["A", "B"].flatMap((chain, chainIndex) =>
            atoms.map((line, atomIndex) => {
                const padded = line.padEnd(80, " ");
                const serial = String(atomIndex + 1 + chainIndex * atoms.length).padStart(5);
                const x = (Number(padded.slice(30, 38)) + chainIndex * 24).toFixed(3).padStart(8);
                return `${padded.slice(0, 6)}${serial}${padded.slice(11, 21)}${chain}${padded.slice(22, 30)}${x}${padded.slice(38)}`.trimEnd();
            }),
        );
        return { ...slice, pdb: [...headers, ...chainAtoms, "END"].join("\n") };
    });
    return JSON.stringify(manifest);
}

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

test("renders multi-chain timepoints as distinct centered tiles", async ({ page }) => {
    const source = readFileSync(join(__dirname, "test-data", "example.rmsx.json"), "utf8");
    const manifest = makeTwoChainManifest(source);
    await routeDatasetDisplay(page, async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: manifest });
    });

    await page.goto("http://localhost:5173?dataset_id=two-chain");
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await expect(page.getByTestId("molstar-slice-chip")).toHaveCount(9);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(2000);
    await expect(page.locator("#molstarViewport")).toHaveScreenshot("multi-chain.png", {
        maxDiffPixelRatio: 0.07,
        timeout: 20000,
    });
});

test("dev mode loads the bundled example manifest without a dataset id", async ({ page }) => {
    await page.goto("http://localhost:5173");
    await expect(page.locator("#status")).toContainText("9/9 slices visible", { timeout: 90000 });
    await expect(page.getByTestId("molstar-slice-chip")).toHaveCount(9);
    await expect(page.locator("#status")).not.toHaveClass(/error/);
});
