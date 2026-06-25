import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.jsx";

/* Access container element */
const appElement = document.querySelector("#app");

/* Resolve dataset id in dev mode: URL param > env var > __test__ sentinel. */
if (import.meta.env.DEV) {
    const pageUrl = new URL(window.location.href);
    const datasetId = pageUrl.searchParams.get("dataset_id") || process.env.dataset_id || "__test__";
    const dataIncoming = {
        root: "/",
        visualization_config: { dataset_id: datasetId },
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
