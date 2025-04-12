import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id
        },
    };

    // Attach config to the data-incoming attribute
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");
const datasetId = incoming.visualization_config.dataset_id;
const datasetUrl = incoming.visualization_config.dataset_url;
const root = incoming.root;
const url = datasetUrl || `${root}api/datasets/${datasetId}/display`;

createRoot(appElement).render(
    <StrictMode>
        <App url={url} />
    </StrictMode>,
);