import { useEffect, useState } from "react";
import { Coordinator, wasmConnector } from "@uwdata/mosaic-core";
import { EmbeddingAtlas } from "embedding-atlas/react";

const TABLE_NAME = "atlas_data";
const VIRTUAL_FILE = "dataset";

/* Build the DuckDB SELECT for a virtual filename based on the Galaxy
 * extension. Extensions match the data_sources block in atlas.xml. */
function readExpression(ext) {
    const e = (ext || "").toLowerCase();
    if (e === "parquet") return `read_parquet('${VIRTUAL_FILE}')`;
    if (e === "jsonl" || e === "ndjson") return `read_json_auto('${VIRTUAL_FILE}', format='newline_delimited')`;
    if (e === "tsv" || e === "tabular") return `read_csv_auto('${VIRTUAL_FILE}', delim='\t')`;
    /* csv (default) */
    return `read_csv_auto('${VIRTUAL_FILE}')`;
}

/* Pick two projection columns. Honors explicit names if present,
 * otherwise falls back to known synonyms, then to the first two numerics. */
function pickProjection(columns, types, hint) {
    const wanted = (hint || {}).projection || {};
    const named = (n) => n && columns.find((c) => c.toLowerCase() === String(n).toLowerCase());
    const synonyms = (...names) => names.map(named).find(Boolean);
    const x = named(wanted.x) || synonyms("x", "UMAP_1", "umap_1", "tsne_1", "longitude");
    const y = named(wanted.y) || synonyms("y", "UMAP_2", "umap_2", "tsne_2", "latitude");
    if (x && y) return { x, y };
    const numeric = columns.filter((c, i) =>
        /^(BIG|TINY|SMALL|U?INT|DECIMAL|DOUBLE|FLOAT|REAL|HUGEINT)/.test((types[i] || "").toUpperCase()),
    );
    return { x: numeric[0] || columns[0], y: numeric[1] || columns[1] };
}

/* Pick an id and text column when not explicitly named. */
function pickColumn(columns, hint, candidates) {
    if (hint) {
        const m = columns.find((c) => c.toLowerCase() === hint.toLowerCase());
        if (m) return m;
    }
    for (const c of candidates) {
        const m = columns.find((col) => col.toLowerCase() === c);
        if (m) return m;
    }
    return undefined;
}

/* Resolve the Galaxy extension when not provided on `incoming`. */
async function resolveExtension(root, datasetId, fallbackUrl) {
    try {
        const r = await fetch(`${root}api/datasets/${datasetId}`);
        if (r.ok) {
            const meta = await r.json();
            if (meta && meta.extension) return String(meta.extension).toLowerCase();
        }
    } catch (_e) {
        /* fall through */
    }
    const tail = (fallbackUrl || "").split(".").pop() || "";
    if (["csv", "tsv", "tabular", "parquet", "jsonl", "ndjson"].includes(tail.toLowerCase())) {
        return tail.toLowerCase();
    }
    return "csv";
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
                const cfg = incoming.visualization_config || {};
                const datasetUrl =
                    cfg.dataset_url || (cfg.dataset_id ? `${root}api/datasets/${cfg.dataset_id}/display` : null);
                if (!datasetUrl) {
                    throw new Error("No dataset URL or id provided.");
                }

                setStatus({ kind: "loading", message: "Connecting to DuckDB-WASM…" });
                const connector = wasmConnector();
                coordinator.databaseConnector(connector);
                /* Force lazy DB init now so registerFileBuffer is available. */
                const db = await connector.getDuckDB();

                /* DuckDB-WASM treats relative URLs as local file paths and
                 * routes absolute URLs through its own httpfs (which bypasses
                 * the browser network stack and thus playwright's route
                 * interceptor). Fetch via the browser ourselves so the
                 * standard auth/proxy/intercept chain applies, then register
                 * the result as a virtual file inside the WASM filesystem. */
                setStatus({ kind: "loading", message: "Fetching dataset…" });
                const response = await fetch(datasetUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} fetching dataset`);
                }
                const buffer = new Uint8Array(await response.arrayBuffer());
                await db.registerFileBuffer(VIRTUAL_FILE, buffer);

                const ext =
                    (cfg.dataset_ext || "").toLowerCase() ||
                    (cfg.dataset_id ? await resolveExtension(root, cfg.dataset_id, datasetUrl) : "csv");

                setStatus({ kind: "loading", message: "Loading dataset into DuckDB…" });
                const readExpr = readExpression(ext);
                await coordinator.exec(`CREATE OR REPLACE TABLE ${TABLE_NAME} AS SELECT * FROM ${readExpr};`);

                /* Discover schema */
                const schemaResult = await coordinator.query(
                    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${TABLE_NAME}'`,
                );
                const rows = schemaResult.toArray ? schemaResult.toArray() : Array.from(schemaResult);
                const columns = rows.map((r) => r.column_name);
                const types = rows.map((r) => r.data_type);
                if (cancelled) return;

                const projection = pickProjection(columns, types, cfg);
                const idCol = pickColumn(columns, cfg.id_column, ["id", "identifier", "index"]);
                const textCol = pickColumn(columns, cfg.text_column, [
                    "text",
                    "label",
                    "name",
                    "title",
                    "description",
                ]);

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

    if (status.kind === "error") {
        return <div className="atlas-status error">Failed to render Embedding Atlas: {status.message}</div>;
    }
    if (status.kind !== "ready" || !dataProps) {
        return <div className="atlas-status">{status.message}</div>;
    }
    return <EmbeddingAtlas coordinator={coordinator} data={dataProps} />;
}
