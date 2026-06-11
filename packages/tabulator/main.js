import "./main.css";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator_simple.css";

// Constants
const CSV = "csv";
const DELAY = 100;
const LIMIT = 50;
const LINES = 99999;

// Test fixture
const TEST_DATA_FILE = "test-data/test.tsv";
const TEST_DATA_EXTENSION = "tabular";
const TEST_DATASET_ID = "__test__";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    const pageUrl = new URL(window.location.href);
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: pageUrl.searchParams.get("dataset_id") || process.env.dataset_id || TEST_DATASET_ID,
        },
    };
    // Attach config to the data-incoming attribute
    appElement.dataset.incoming = JSON.stringify(dataIncoming);
}

// Access attached data
const incoming = JSON.parse(appElement.dataset.incoming || "{}");

/** Now you can consume the incoming data in your application.
 * In this example, the data was attached in the development mode block.
 * In production, this data will be provided by Galaxy.
 */
const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

if (datasetId === TEST_DATASET_ID) {
    installTestFetch();
}

/* Wether the first row is containig column names or not */
let hasNames = false;
let hasCompleted = false;

/* Build the data request url. Modify the API route if necessary. */
const metaUrl = `${root}api/datasets/${datasetId}`;

/* Build and attach message element */
const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

/* Build and attach table element */
const tableElement = document.createElement("div");
tableElement.id = "table";
tableElement.style.height = "100vh";
appElement.appendChild(tableElement);

async function create() {
    showMessage("Loading...");
    const dataset = await getData(metaUrl);
    if (dataset.metadata_columns > 0) {
        render(dataset);
        hideMessage();
    } else {
        showMessage("No columns found in dataset.");
    }
}

async function getContent(dataset, params) {
    if (!hasCompleted) {
        const columnTypes = dataset.metadata_column_types;
        const offset = (params.page - 1) * params.size;
        const base = `${root}api/datasets/${datasetId}?data_type=raw_data&provider=line`;
        const url = `${base}&offset=${hasNames ? 1 + offset : offset}&limit=${LIMIT}`;
        console.debug(`[tabulator] ${url}`);
        const { data } = await getData(url);
        hasCompleted = data.length === 0;
        const delimiter = dataset.extension === CSV ? "," : "\t";
        return data.map((line) => {
            const cells = String(line).split(delimiter);
            return Object.fromEntries(columnTypes.map((_, i) => [i, cells[i] ?? ""]));
        });
    } else {
        return [];
    }
}

async function getData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
        return response.json();
    } catch (e) {
        showMessage("Failed to retrieve data.", e);
    }
}

function installTestFetch() {
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
            const limit = parseInt(u.searchParams.get("limit") || String(LIMIT), 10);
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

function getColumns(dataset) {
    const result = dataset.metadata_column_types.slice();
    const columnCount = dataset.metadata_columns;
    const columnNames = dataset.metadata_column_names;
    if (columnNames && columnNames.length === columnCount) {
        hasNames = true;
        columnNames.forEach((name, index) => {
            result[index] = name;
        });
    }
    return result;
}

async function render(dataset) {
    const columns = getColumns(dataset);
    const lineCount = dataset.metadata_data_lines || LINES;
    const last_page = Math.ceil(lineCount / LIMIT);
    const tabulatorColumns = columns.map((col, index) => ({
        title: `${index + 1}: ${col}`,
        field: String(index),
        headerSort: false,
    }));
    new Tabulator(tableElement, {
        columns: tabulatorColumns,
        filterMode: "remote",
        progressiveLoad: "scroll",
        progressiveLoadDelay: DELAY,
        progressiveLoadScrollMargin: 0,
        paginationSize: LIMIT,
        ajaxURL: "unused-but-required",
        ajaxRequestFunc: async (_, __, params) => {
            try {
                const data = await getContent(dataset, params);
                return { data };
            } catch (e) {
                showMessage("Failed to retrieve scroll data", e);
                return { data: [] };
            }
        },
        ajaxResponse: (_, __, response) => ({ data: response.data, last_page }),
    });
}

function showMessage(title, details = null) {
    details = details ? `: ${details}` : "";
    messageElement.innerHTML = `${title}${details}`;
    messageElement.style.display = "inline";
    console.debug(`${title}${details}`);
}

function hideMessage() {
    messageElement.style.display = "none";
}

create();
