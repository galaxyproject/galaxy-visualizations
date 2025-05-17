import axios from "axios";
import "./main.css";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator_simple.css";

// Number of rows per request
const DELAY = 100;
const LIMIT = 50;

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
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

/* Wether the first row is containig column names or not */
let hasNames = false;

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
    const columnTypes = dataset.metadata_column_types;
    const offset = (params.page - 1) * params.size;
    const base = `${root}api/datasets/${datasetId}?data_type=raw_data&provider=dataset-column`;
    const url = `${base}&offset=${hasNames ? 1 + offset : offset}&limit=${LIMIT}`;
    console.debug(`[TABULATOR] ${url}`);
    const { data } = await getData(url);
    return data.map((row) => Object.fromEntries(columnTypes.map((_, i) => [i, row[i]])));
}

async function getData(url) {
    try {
        const { data } = await axios.get(url);
        return data;
    } catch (e) {
        showMessage("Failed to retrieve data.", e);
    }
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
    const last_page = Math.ceil(dataset.metadata_data_lines / LIMIT);
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
