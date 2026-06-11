/* Dev-only fetch interceptor that serves the test fixture in place of a live
 * Galaxy when the dataset id is TEST_DATASET_ID. Same intercept boundary the
 * Playwright spec uses, so the downstream code paths are identical. */

const TEST_DATA_FILE = "test-data/test.tsv";
const TEST_DATA_EXTENSION = "tsv";
const TEST_DELIMITER = "\t";
const FALLBACK_LIMIT = 50;

export const TEST_DATASET_ID = "__test__";

export function installTestFetch() {
    const realFetch = window.fetch.bind(window);
    let linesPromise = null;
    const loadLines = () => {
        if (!linesPromise) {
            linesPromise = realFetch(TEST_DATA_FILE)
                .then((r) => r.text())
                .then((text) => text.replace(/\n$/, "").split("\n"));
        }
        return linesPromise;
    };
    const jsonResponse = (body) =>
        new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (!url.includes(`/api/datasets/${TEST_DATASET_ID}`)) {
            return realFetch(input, init);
        }
        const lines = await loadLines();
        const header = lines[0].split(TEST_DELIMITER);
        const columnTypes = header.map((_, i) => (i < 2 ? "str" : "float"));
        const u = new URL(url, window.location.origin);
        if (u.searchParams.has("data_type")) {
            const offset = parseInt(u.searchParams.get("offset") || "0", 10);
            const limit = parseInt(u.searchParams.get("limit") || String(FALLBACK_LIMIT), 10);
            const rows = lines
                .slice(offset, offset + limit)
                .map((line) => coerceCells(line.split(TEST_DELIMITER), columnTypes));
            return jsonResponse({ data: rows });
        }
        return jsonResponse({
            extension: TEST_DATA_EXTENSION,
            metadata_columns: header.length,
            metadata_column_types: columnTypes,
            metadata_column_names: header,
            metadata_data_lines: lines.length,
        });
    };
}

/* Mimics what Galaxy's dataset-column provider returns: cells parsed to the
 * declared column type; values that can't be coerced come back as null. */
function coerceCells(cells, columnTypes) {
    return columnTypes.map((type, i) => coerceCell(cells[i], type));
}

function coerceCell(value, type) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
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
