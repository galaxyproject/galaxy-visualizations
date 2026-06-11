/* Dev-only fetch interceptor that serves the test fixture in place of a live
 * Galaxy when the dataset id is TEST_DATASET_ID. Same intercept boundary the
 * Playwright spec uses, so the downstream code paths are identical. */

const TEST_DATA_FILE = "test-data/test.tsv";
const TEST_DATA_EXTENSION = "tsv";
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
        const u = new URL(url, window.location.origin);
        if (u.searchParams.has("data_type")) {
            const offset = parseInt(u.searchParams.get("offset") || "0", 10);
            const limit = parseInt(u.searchParams.get("limit") || String(FALLBACK_LIMIT), 10);
            return jsonResponse({ data: lines.slice(offset, offset + limit) });
        }
        const header = lines[0].split("\t");
        return jsonResponse({
            extension: TEST_DATA_EXTENSION,
            metadata_columns: header.length,
            metadata_column_types: header.map((_, i) => (i < 2 ? "str" : "float")),
            metadata_column_names: [],
            metadata_data_lines: lines.length,
        });
    };
}
