import "./main.css";
import { renderVisualization } from "./render.js";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_url: "http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.bcsl.ts",
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
const datasetUrl = incoming.visualization_config.dataset_url;
const root = incoming.root;

/* Build the data request url. Modify the API route if necessary. */
const url = datasetUrl || `${root}api/datasets/${datasetId}/display`;

/* Build and attach message element */
const messageElement = document.createElement("div");
messageElement.id = "message";
appElement.appendChild(messageElement);

/* Create Editor */
async function create() {
    /* Build and attach viewport element */
    const viewportElement = document.createElement("div");
    viewportElement.id = "viewport";
    appElement.appendChild(viewportElement);
    try {
        await renderVisualization(viewportElement, url);
    } catch (e) {
        showMessage("Failed to create", e);
    }
}

function showMessage(title, message) {
    const msg = `${title}: ${message}`;
    messageElement.innerHTML = msg;
    messageElement.style.display = "inline";
    console.error(msg);
}

create();
