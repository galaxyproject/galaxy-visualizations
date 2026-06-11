import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const maxDiffPixelRatio = 0.07;

/* Each entry exercises a specific Galaxy metadata shape:
 *  - tsv:                    no column_names (plain tabular-style), row 1 displayed as data
 *  - tsv_with_header:        column_names = first row, tab delimiter
 *  - csv_with_header:        column_names = first row, comma delimiter
 *  - tabular_with_comments:  no header, # comments stripped server-side
 *    by the line provider so the fixture omits them from the mocked stream */
const TESTS = {
    tsv: {
        file: "test.tsv",
        extension: "tsv",
        delimiter: "\t",
        columnTypes: (cols) => cols.map((_, i) => (i < 2 ? "str" : "float")),
        columnNames: () => [],
    },
    tsv_with_header: {
        file: "tsv_with_header.tsv",
        extension: "tsv",
        delimiter: "\t",
        columnTypes: () => ["str", "str", "float"],
        columnNames: (header) => header,
    },
    csv_with_header: {
        file: "csv_with_header.csv",
        extension: "csv",
        delimiter: ",",
        columnTypes: () => ["str", "str", "float"],
        columnNames: (header) => header,
    },
    tabular_with_comments: {
        file: "tabular_with_comments.tsv",
        extension: "tabular",
        delimiter: "\t",
        columnTypes: () => ["str", "str", "float"],
        columnNames: () => [],
        stripPrefix: "#",
    },
};

function mockMetadata(lines, fixture) {
    const header = lines[0].split(fixture.delimiter);
    return {
        extension: fixture.extension,
        metadata_columns: header.length,
        metadata_column_types: fixture.columnTypes(header),
        metadata_column_names: fixture.columnNames(header),
        metadata_data_lines: lines.length,
        metadata_delimiter: fixture.delimiter,
    };
}

test("basic", async ({ page }) => {
    await page.route("**/api/datasets/**", async (route) => {
        const url = new URL(route.request().url());
        const match = url.pathname.match(/\/api\/datasets\/([^/]+)$/);
        const name = match?.[1];
        const fixture = name ? TESTS[name] : null;
        if (!fixture) {
            return route.continue();
        }
        const content = readFileSync(join(__dirname, "test-data", fixture.file), "utf8");
        const allLines = content.replace(/\n$/, "").split("\n");
        const lines = fixture.stripPrefix
            ? allLines.filter((l) => !l.startsWith(fixture.stripPrefix))
            : allLines;
        if (url.searchParams.has("data_type")) {
            const offset = parseInt(url.searchParams.get("offset") || "0", 10);
            const limit = parseInt(url.searchParams.get("limit") || "50", 10);
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ data: lines.slice(offset, offset + limit) }),
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockMetadata(lines, fixture)),
            });
        }
    });
    for (const name of Object.keys(TESTS)) {
        await page.goto(`http://localhost:5173?dataset_id=${name}`);
        await page.waitForSelector("#table .tabulator-row");
        await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio });
    }
});
