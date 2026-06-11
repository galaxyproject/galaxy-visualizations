import "./main.css";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator_simple.css";
import { installTestFetch, TEST_DATASET_ID } from "./test-fetch.js";

// Thresholds
const DELAY = 100;
const LIMIT = 50;
const LINES = 99999;

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
    if (!dataset) {
        return;
    }
    if (dataset.metadata_columns > 0) {
        render(describeDataset(dataset));
        hideMessage();
    } else {
        showMessage("No columns found in dataset.");
    }
}

/* Derive immutable rendering signals from Galaxy's dataset metadata.
 * Galaxy's datatype contract: tsv/csv always have a header (column_names
 * is the first row); plain tabular never has a header. The dataset-column
 * provider splits and type-coerces server-side per column_types, so the
 * client just needs to know how many rows to skip and what to title each
 * column with. */
function describeDataset(dataset) {
    const columnTypes = dataset.metadata_column_types || [];
    const columnCount = Number(dataset.metadata_columns) || columnTypes.length;
    const columnNames = dataset.metadata_column_names;
    const hasHeader = Array.isArray(columnNames) && columnNames.length === columnCount;
    const titles = hasHeader ? columnNames : columnTypes;
    const columnTitles = Array.from({ length: columnCount }, (_, i) => titles[i] ?? "");
    const totalDataRows = (dataset.metadata_data_lines || LINES) - (hasHeader ? 1 : 0);
    return { columnCount, columnTitles, dataStartOffset: hasHeader ? 1 : 0, totalDataRows };
}

async function getContent(descriptor, params) {
    if (!hasCompleted) {
        const offset = (params.page - 1) * params.size;
        const base = `${root}api/datasets/${datasetId}?data_type=raw_data&provider=dataset-column`;
        const url = `${base}&offset=${descriptor.dataStartOffset + offset}&limit=${LIMIT}`;
        console.debug(`[tabulator] ${url}`);
        const { data } = await getData(url);
        hasCompleted = data.length === 0;
        return data.map((row) =>
            Object.fromEntries(
                Array.from({ length: descriptor.columnCount }, (_, i) => [i, row[i] ?? ""]),
            ),
        );
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

async function render(descriptor) {
    const last_page = Math.ceil(descriptor.totalDataRows / LIMIT);
    const tabulatorColumns = descriptor.columnTitles.map((col, index) => ({
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
                const data = await getContent(descriptor, params);
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
