import axios from "axios";
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
            dataset_id: process.env.dataset_id,
            dataset_content: {
                version: "1.0.4",
                name: "My example config",
                description: "This demonstrates the JSON schema",
                datasets: [
                    {
                        uid: "D1",
                        name: "Dries",
                        files: [
                            {
                                url: "https://data-1.vitessce.io/0.0.31/master_release/dries/dries.cells.json",
                                type: "cells",
                                fileType: "cells.json",
                            },
                            {
                                url: "https://data-1.vitessce.io/0.0.31/master_release/dries/dries.cell-sets.json",
                                type: "cell-sets",
                                fileType: "cell-sets.json",
                            },
                        ],
                    },
                ],
                coordinationSpace: {
                    dataset: {
                        A: "D1",
                    },
                    embeddingType: {
                        A: "UMAP",
                        B: "t-SNE",
                    },
                    embeddingZoom: {
                        A: 2.5,
                    },
                },
                layout: [
                    {
                        component: "scatterplot",
                        coordinationScopes: {
                            dataset: "A",
                            embeddingType: "A",
                            embeddingZoom: "A",
                        },
                        x: 6,
                        y: 0,
                        w: 6,
                        h: 6,
                    },
                    {
                        component: "scatterplot",
                        coordinationScopes: {
                            dataset: "A",
                            embeddingType: "B",
                            embeddingZoom: "A",
                        },
                        x: 0,
                        y: 0,
                        w: 6,
                        h: 6,
                    },
                    {
                        component: "cellSets",
                        coordinationScopes: {
                            dataset: "A",
                        },
                        x: 0,
                        y: 6,
                        w: 6,
                        h: 6,
                    },
                    {
                        component: "cellSetSizes",
                        coordinationScopes: {
                            dataset: "A",
                        },
                        x: 6,
                        y: 6,
                        w: 6,
                        h: 6,
                    },
                ],
                initStrategy: "auto",
            },
        },
    };

    // Attach config to the data-incoming attribute
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");
const root = incoming.root;
const visualizationConfig = incoming.visualization_config || {};

function datasetsGetUrl(root, datasetId) {
    return `${window.location.origin}${root}api/datasets/${datasetId}/display`;
}

async function render() {
    let datasetContent = "";
    if (visualizationConfig.dataset_id) {
        const datasetUrl = datasetsGetUrl(root, visualizationConfig.dataset_id);
        const { data } = await axios.get(datasetUrl);
        datasetContent = data;
    } else {
        datasetContent = visualizationConfig.dataset_content;
    }

    createRoot(appElement).render(
        <StrictMode>
            <App datasetContent={datasetContent} />
        </StrictMode>,
    );
}

render();
