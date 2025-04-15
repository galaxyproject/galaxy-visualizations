import "./style.css";
import { WebViewer } from "@rerun-io/web-viewer";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: `${window.location.origin}/`,
        visualization_config: {
            dataset_id: process.env.dataset_id,
            dataset_url: process.env.dataset_id ? null : "motion.rrd",
        },
    };

    // Attach config to the data-incoming attribute
    appElement?.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement.getAttribute("data-incoming") || "{}");

/** Now you can consume the incoming data in your application.
 * In this example, the data was attached in the development mode block.
 * In production, this data will be provided by Galaxy.
 */
const datasetId = incoming.visualization_config.dataset_id;
const datasetUrl = incoming.visualization_config.dataset_url;
const root = incoming.root;

/* Build the data request url. Modify the API route if necessary. */
const url = datasetUrl || `${root}api/datasets/${datasetId}/display`;

new WebViewer().start(url, null, {
    width: "100%",
    height: "100%",
});
