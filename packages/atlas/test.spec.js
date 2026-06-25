import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const maxDiffPixelRatio = 0.07;

/* Each entry exercises one Galaxy datatype handled by the plugin's
 * `read_csv_auto` / `read_parquet` / `read_json_auto` dispatch. Mocked at
 * the network boundary so the dev server doesn't need a real Galaxy. */
const TESTS = {
    /* csv: real header row, comma delimiter, no # comments */
    csv: {
        file: "test.csv",
        extension: "csv",
        contentType: "text/csv",
    },
    /* tabular: no header row, # comments at the top, tab delimiter.
     * Exercises the headerless dispatch path: without it DuckDB would treat
     * the first data row as column names and Atlas's first two numeric
     * columns would shift up by one row. */
    tabular: {
        file: "test.tabular",
        extension: "tabular",
        contentType: "text/tab-separated-values",
    },
    /* tsv: real header row with explicit x/y/id/label columns, tab
     * delimiter, no # comments. Exercises the named-projection path:
     * pickProjection should match x/y directly via synonyms, pickColumn
     * should match id and label, and no _atlas_row_id synthesis is needed. */
    tsv: {
        file: "test.tsv",
        extension: "tsv",
        contentType: "text/tab-separated-values",
    },
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
            const body = readFileSync(join(__dirname, "test-data", fixture.file));
            await route.fulfill({ status: 200, contentType: fixture.contentType, body });
        } else {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ extension: fixture.extension }),
            });
        }
    });

    for (const name of Object.keys(TESTS)) {
        await page.goto(`http://localhost:5173?dataset_id=${name}`);
        /* Atlas renders into a canvas once DuckDB-WASM finishes loading the
         * dataset and the embedding view mounts. Use the canvas selector as
         * the "ready" signal, then wait briefly for the first paint to
         * stabilise before snapshotting. */
        await page.waitForSelector("canvas", { timeout: 90000 });
        await page.waitForTimeout(2000);
        await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio });
    }
});
