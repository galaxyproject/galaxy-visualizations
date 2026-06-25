import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.jsx";

/* Access container element */
const appElement = document.querySelector("#app");

/* Attach mock data for development */
if (import.meta.env.DEV) {
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
            /* dev fallback: a small public CSV with x/y/text columns */
            dataset_url: process.env.dataset_id
                ? null
                : "https://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.csv",
            dataset_ext: process.env.dataset_id ? null : "csv",
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
