import { useEffect, useState } from "react";
import { Coordinator, wasmConnector } from "@uwdata/mosaic-core";
import { EmbeddingAtlas } from "embedding-atlas/react";
import * as duckdb from "@duckdb/duckdb-wasm";

/* DuckDB-WASM bundle URLs resolved at build time by Vite's `?url` loader.
 * Files end up in `static/` alongside index.js so the plugin is fully
 * self-contained — no jsdelivr fetch at runtime. */
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

const DUCKDB_BUNDLES = {
    mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker },
    eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker },
};

async function createDuckDBConnector() {
    const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
    const worker = new Worker(bundle.mainWorker);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await db.instantiate(bundle.mainModule);
    return wasmConnector({ duckdb: db });
}

/* Local dev fixture used when no real Galaxy dataset is selected. */
const TEST_DATASET_ID = "__test__";
const TEST_DATA_FILE = "test-data/test.csv";
const TEST_DATA_EXTENSION = "csv";

const TABLE_NAME = "atlas_data";
const VIRTUAL_FILE = "dataset";

/* DuckDB read expression for a Galaxy extension. Tabular has no header
 * and recognises `#` comments; tsv and csv always carry a header. */
function readExpression(ext) {
    const e = (ext || "").toLowerCase();
    if (e === "parquet") return `read_parquet('${VIRTUAL_FILE}')`;
    if (e === "jsonl" || e === "ndjson") return `read_json_auto('${VIRTUAL_FILE}', format='newline_delimited')`;
    if (e === "tabular") {
        return `read_csv_auto('${VIRTUAL_FILE}', delim='\t', header=false, comment='#')`;
    }
    if (e === "tsv") {
        return `read_csv_auto('${VIRTUAL_FILE}', delim='\t', header=true)`;
    }
    /* csv */
    return `read_csv_auto('${VIRTUAL_FILE}', header=true)`;
}

/* Pick two projection columns by name synonyms, falling back to the first
 * two numeric columns. Throws if the dataset has fewer than two numerics. */
function pickProjection(columns, types) {
    const named = (n) => columns.find((c) => c.toLowerCase() === n.toLowerCase());
    const synonyms = (...names) => names.map(named).find(Boolean);
    const x = synonyms("x", "UMAP_1", "umap_1", "tsne_1", "longitude");
    const y = synonyms("y", "UMAP_2", "umap_2", "tsne_2", "latitude");
    if (x && y) return { x, y };
    const numeric = columns.filter((c, i) =>
        /^(BIG|TINY|SMALL|U?INT|DECIMAL|DOUBLE|FLOAT|REAL|HUGEINT)/.test((types[i] || "").toUpperCase()),
    );
    if (numeric.length < 2) {
        throw new Error(
            "Need at least two numeric columns for a 2D scatter; add an `x`/`y` projection to the dataset.",
        );
    }
    return { x: numeric[0], y: numeric[1] };
}

/* Pick an id or text column from a list of candidate names. */
function pickColumn(columns, candidates) {
    for (const c of candidates) {
        const m = columns.find((col) => col.toLowerCase() === c);
        if (m) return m;
    }
    return undefined;
}

/* Fetch the dataset bytes + Galaxy extension. */
async function fetchDataset(root, datasetId) {
    if (datasetId === TEST_DATASET_ID) {
        const response = await fetch(TEST_DATA_FILE);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} fetching local test fixture ${TEST_DATA_FILE}`);
        }
        const buffer = new Uint8Array(await response.arrayBuffer());
        return { buffer, ext: TEST_DATA_EXTENSION };
    }
    const metaResponse = await fetch(`${root}api/datasets/${datasetId}`);
    if (!metaResponse.ok) {
        throw new Error(`HTTP ${metaResponse.status} fetching dataset metadata from Galaxy`);
    }
    const meta = await metaResponse.json();
    const ext = String(meta.extension || "").toLowerCase();
    if (!ext) {
        throw new Error("Galaxy dataset metadata is missing the extension field");
    }
    const dataResponse = await fetch(`${root}api/datasets/${datasetId}/display`);
    if (!dataResponse.ok) {
        throw new Error(`HTTP ${dataResponse.status} fetching dataset content from Galaxy`);
    }
    const buffer = new Uint8Array(await dataResponse.arrayBuffer());
    return { buffer, ext };
}

export default function App({ incoming }) {
    const [status, setStatus] = useState({ kind: "loading", message: "Initializing…" });
    const [coordinator] = useState(() => new Coordinator());
    const [dataProps, setDataProps] = useState(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const root = incoming.root || "/";
                const datasetId = (incoming.visualization_config || {}).dataset_id;
                if (!datasetId) {
                    throw new Error("No dataset id provided.");
                }

                setStatus({ kind: "loading", message: "Connecting to DuckDB-WASM…" });
                const connector = await createDuckDBConnector();
                coordinator.databaseConnector(connector);
                const db = await connector.getDuckDB();

                /* Fetch in the browser and register as a virtual file so
                 * the standard auth/proxy chain applies. */
                setStatus({ kind: "loading", message: "Fetching dataset…" });
                const { buffer, ext } = await fetchDataset(root, datasetId);
                await db.registerFileBuffer(VIRTUAL_FILE, buffer);

                setStatus({ kind: "loading", message: "Loading dataset into DuckDB…" });
                const readExpr = readExpression(ext);
                await coordinator.exec(`CREATE OR REPLACE TABLE ${TABLE_NAME} AS SELECT * FROM ${readExpr};`);

                const schemaResult = await coordinator.query(
                    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${TABLE_NAME}'`,
                );
                const rows = schemaResult.toArray ? schemaResult.toArray() : Array.from(schemaResult);
                const columns = rows.map((r) => r.column_name);
                const types = rows.map((r) => r.data_type);
                if (cancelled) return;

                const projection = pickProjection(columns, types);
                const idCol = pickColumn(columns, ["id", "identifier", "index"]);
                const textCol = pickColumn(columns, ["text", "label", "name", "title", "description"]);

                /* Atlas needs a stable id column; synthesise one if missing. */
                if (!idCol) {
                    await coordinator.exec(`ALTER TABLE ${TABLE_NAME} ADD COLUMN _atlas_row_id BIGINT;`);
                    await coordinator.exec(`UPDATE ${TABLE_NAME} SET _atlas_row_id = rowid;`);
                }

                setDataProps({
                    table: TABLE_NAME,
                    id: idCol || "_atlas_row_id",
                    projection,
                    text: textCol,
                });
                setStatus({ kind: "ready" });
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setStatus({ kind: "error", message: err.message || String(err) });
                }
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [incoming, coordinator]);

    return (
        <>
            {status.kind !== "ready" && (
                <div id="message">
                    {status.kind === "error" ? (
                        <>
                            <strong>Error:</strong> {status.message}
                        </>
                    ) : (
                        status.message
                    )}
                </div>
            )}
            {status.kind === "ready" && dataProps && <EmbeddingAtlas coordinator={coordinator} data={dataProps} />}
        </>
    );
}
