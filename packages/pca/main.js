import "./main.css";
import { render } from "./render.js";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
            dataset_url: null,
        },
    };

    // Attach config to the data-incoming attribute
    appElement.dataset.incoming = JSON.stringify(dataIncoming);
}

// Access attached data
const incoming = JSON.parse(appElement.dataset.incoming || "{}");

/* Load attribute */
const datasetId = incoming.visualization_config.dataset_id;
const datasetUrl = incoming.visualization_config.dataset_url;
const root = incoming.root;

/* Build the data request url. */
const url = datasetUrl || `${root}api/datasets/${datasetId}/display`;

/* Build and attach viewport element */
const viewportElement = document.createElement("div");
viewportElement.id = "viewport";
appElement.appendChild(viewportElement);
render(viewportElement, url);
