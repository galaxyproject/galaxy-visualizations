import axios from "axios";
import "./main.css";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: "43beb0c095213b7e", //process.env.dataset_id,
        },
    };

    // Attach config to the data-incoming attribute
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

/** Now you can consume the incoming data in your application.
 * In this example, the data was attached in the development mode block.
 * In production, this data will be provided by Galaxy.
 */
const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

/* Build the data request url. Modify the API route if necessary. */
const dataUrl = `${root}api/datasets/${datasetId}?data_type=raw_data&provider=dataset-column`;
const metaUrl = `${root}api/datasets/${datasetId}`;

/* Build and attach message element */
const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

/* Build and attach table element */
const tableElement = document.createElement("div");
tableElement.id = "table";
appElement.appendChild(tableElement);

async function getData(url) {
    try {
        hideError();
        const { data } = await axios.get(url);
        return data;
    } catch (e) {
        showError("Failed to retrieve data.", e);
    }
}

function renderTabulator(columns, data) {
    const tabulatorColumns = columns.map((col) => ({ title: col, field: col }));
    const tabulatorData = data.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
    new Tabulator(tableElement, {
        columns: tabulatorColumns,
        data: tabulatorData,
    });
}

function getColumns(dataset) {
    const result = dataset.metadata_column_types;
    const columnCount = dataset.metadata_columns;
    const columnNames = dataset.metadata_column_names;
    if (columnNames && columnNames.length === columnCount) {
        dataset.metadata_column_names.forEach((name, index) => {
            result[index] = name;
        });
    }
    return result;
}

async function render() {
    const dataset = await getData(metaUrl);
    const data = await getData(dataUrl);
    const columns = getColumns(dataset);
    renderTabulator(columns, data.data);
}

function showError(title, err) {
    messageElement.innerHTML = `<strong>${title}: ${err}</strong>`;
    messageElement.style.display = "inline";
    console.error(`Error loading: ${err}`);
}

function hideError() {
    messageElement.style.display = "none";
}

render();
