import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.jsx";

/* Access container element */
const appElement = document.querySelector("#app");

/* Attach mock data for development.
 *
 * Resolution order for the dataset id:
 *   1. ?dataset_id=<name> URL parameter (lets playwright drive specific
 *      fixtures via page.goto and intercept the matching /api/datasets/<name>
 *      requests with page.route)
 *   2. process.env.dataset_id (set via GALAXY_DATASET_ID env var)
 *   3. fall back to a hosted CSV from galaxy-test-data via dataset_url
 */
if (import.meta.env.DEV) {
    const pageUrl = new URL(window.location.href);
    const datasetId = pageUrl.searchParams.get("dataset_id") || process.env.dataset_id || "";
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: datasetId,
            dataset_url: datasetId ? null : "https://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.csv",
            dataset_ext: datasetId ? null : "csv",
        },
    };
    appElement.dataset.incoming = JSON.stringify(dataIncoming);
}

/* Access attached data */
const incoming = JSON.parse(appElement.dataset.incoming || "{}");

createRoot(appElement).render(
    <StrictMode>
        <App incoming={incoming} />
    </StrictMode>,
);
