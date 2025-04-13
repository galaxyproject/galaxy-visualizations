// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import storeFactory from "./store";
import { KeplerGl } from "@kepler.gl/components";
import loadDataset from "./load";

// Get target DOM element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
            dataset_url: "kepler.csv",
        },
    };
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Extract dataset info
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");
const datasetId = incoming.visualization_config.dataset_id;
const datasetUrl = incoming.visualization_config.dataset_url;
const root = incoming.root;
const url = datasetUrl || `${root}api/datasets/${datasetId}/display`;

// Prevent overflow
appElement.style.overflow = "hidden";

// Main async render logic
async function render() {
    try {
        const { dataset, config } = await loadDataset(url);
        const rootElement = createRoot(appElement);
        const store = storeFactory(dataset, config);
        rootElement.render(
            <Provider store={store}>
                <KeplerGl id="map" mapboxApiAccessToken={null} width={window.innerWidth} height={window.innerHeight} />
            </Provider>,
        );
    } catch (err) {
        console.error(err);
        appElement.innerHTML = `<div><h3>Failed loading dataset!</h3><p>${err.message}</p></div>`;
    }
}

render();
