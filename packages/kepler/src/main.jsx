// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import store from "./store";
import { KeplerGl } from "@kepler.gl/components";
import { addDataToMap } from "@kepler.gl/actions";
import { processGeojson } from "@kepler.gl/processors";

// Get target DOM element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
            dataset_url: "kepler.geojson",
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
// Main async render logic
async function renderKeplerApp() {
    try {
        // Mount Kepler.gl
        const root = createRoot(appElement);
        root.render(
            <Provider store={store}>
                <KeplerGl id="map" mapboxApiAccessToken={null} width={window.innerWidth} height={window.innerHeight} />
            </Provider>,
        );

        // Better way to wait for Kepler.gl to initialize
        await waitForKeplerReady();

        let dataset = null;
        const res = await fetch(url);
        const contentType = res.headers.get("content-type");
        const text = await res.text();
        const testGeoJsonFile = JSON.parse(text);
        if (contentType.includes("application/json") || text.trim().startsWith("{")) {
            const geojson = JSON.parse(text);
            if (!geojson.features || !Array.isArray(geojson.features)) {
                throw new Error("Invalid GeoJSON format: missing 'features' array.");
            }
            dataset = {
                info: {
                    label: "GeoJSON Data",
                    id: "geojson",
                },
                data: processGeojson(testGeoJsonFile),
            };
        }

        try {
            store.dispatch(
                addDataToMap({
                    datasets: [dataset],
                    options: {
                        centerMap: true,
                        readOnly: false,
                        keepExistingConfig: false,
                    },
                    config: {},
                }),
            );
        } catch (dispatchError) {
            console.error("Dispatch error:", dispatchError);
            throw dispatchError;
        }
    } catch (err) {
        console.error("Render error:", err);
        appElement.innerHTML = `<div style="padding: 2em; font-family: sans-serif; color: red;">
            <h2>Error loading dataset</h2>
            <p>${err.message}</p>
        </div>`;
    }
}

// Helper function to wait for Kepler to be ready
function waitForKeplerReady() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (store.getState().keplerGl.map) {
                clearInterval(checkInterval);
                console.log("Initial store state:", store.getState());
                resolve();
            }
        }, 100);
    });
}

renderKeplerApp();
