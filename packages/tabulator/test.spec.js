import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const maxDiffPixelRatio = 0.07;

/* Each entry exercises a specific Galaxy metadata shape:
 *  - tsv_with_header:        column_names = first row, tab delimiter (the GTEx fixture)
 *  - csv_with_header:        small fixture, header detected, comma delimiter
 *  - csv_with_quotes:        commas embedded in quoted cells, server-side
 *                            csv.reader splits them correctly
 *  - tabular_no_header:      plain tabular per Galaxy's contract (no
 *                            column_names); row 1 is data and strings in
 *                            numeric columns appear as empty cells exactly as
 *                            Galaxy's dataset-column provider returns them
 *  - tabular_with_comments:  no header, # comments stripped server-side, the
 *                            fixture omits them from the mocked stream */
const TESTS = {
    tsv_with_header: {
        file: "tsv_with_header.tsv",
        extension: "tsv",
        delimiter: "\t",
        columnTypes: (cols) => cols.map((_, i) => (i < 2 ? "str" : "float")),
        hasHeader: true,
    },
    csv_with_header: {
        file: "csv_with_header.csv",
        extension: "csv",
        delimiter: ",",
        columnTypes: () => ["str", "str", "float"],
        hasHeader: true,
    },
    csv_with_quotes: {
        file: "csv_with_quotes.csv",
        extension: "csv",
        delimiter: ",",
        columnTypes: () => ["str", "str", "float"],
        hasHeader: true,
        quoted: true,
    },
    tabular_no_header: {
        file: "tabular_no_header.tabular",
        extension: "tabular",
        delimiter: "\t",
        columnTypes: (cols) => cols.map((_, i) => (i < 2 ? "str" : "float")),
        hasHeader: false,
    },
    tabular_with_comments: {
        file: "tabular_with_comments.tabular",
        extension: "tabular",
        delimiter: "\t",
        columnTypes: () => ["str", "str", "float"],
        hasHeader: false,
        stripPrefix: "#",
    },
};

function splitLine(line, fixture) {
    if (!fixture.quoted) {
        return line.split(fixture.delimiter);
    }
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else if (ch === '"') inQuotes = false;
            else cur += ch;
        } else if (ch === '"' && cur === "") {
            inQuotes = true;
        } else if (ch === fixture.delimiter) {
            cells.push(cur);
            cur = "";
        } else {
            cur += ch;
        }
    }
    cells.push(cur);
    return cells;
}

function coerceCell(value, type) {
    if (value === undefined || value === null || value === "") return null;
    if (type === "int") {
        const n = parseInt(value, 10);
        return Number.isNaN(n) ? null : n;
    }
    if (type === "float") {
        const n = parseFloat(value);
        return Number.isNaN(n) ? null : n;
    }
    return value;
}

function mockMetadata(lines, fixture, columnTypes) {
    const header = splitLine(lines[0], fixture);
    return {
        extension: fixture.extension,
        metadata_columns: header.length,
        metadata_column_types: columnTypes,
        metadata_column_names: fixture.hasHeader ? header : [],
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
        const lines = fixture.stripPrefix ? allLines.filter((l) => !l.startsWith(fixture.stripPrefix)) : allLines;
        const header = splitLine(lines[0], fixture);
        const columnTypes = fixture.columnTypes(header);
        if (url.searchParams.has("data_type")) {
            const offset = parseInt(url.searchParams.get("offset") || "0", 10);
            const limit = parseInt(url.searchParams.get("limit") || "50", 10);
            const rows = lines
                .slice(offset, offset + limit)
                .map((line) => splitLine(line, fixture).map((v, i) => coerceCell(v, columnTypes[i])));
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ data: rows }),
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(mockMetadata(lines, fixture, columnTypes)),
            });
        }
    });
    for (const name of Object.keys(TESTS)) {
        await page.goto(`http://localhost:5173?dataset_id=${name}`);
        await page.waitForSelector("#table .tabulator-row");
        await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio });
    }
});
