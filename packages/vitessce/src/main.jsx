import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_url: "vitessce.json",
            dataset_id: "MY_DATASET_ID",
            settings: {},
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

createRoot(appElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
