// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import store from "./store";
import { KeplerGl } from "@kepler.gl/components";
import { addDataToMap } from "@kepler.gl/actions";

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
                <KeplerGl
                    id="kepler"
                    mapboxApiAccessToken={null}
                    width={window.innerWidth}
                    height={window.innerHeight}
                />
            </Provider>,
        );

        // Better way to wait for Kepler.gl to initialize
        await waitForKeplerReady();

        const testGeoJson = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
                    properties: { name: "Test Point" },
                },
            ],
        };

        const dataset = {
            info: {
                label: "GeoJSON Data",
                id: `geojson-${Date.now()}`, // Ensure unique ID
            },
            data: testGeoJson,
        };

        console.log("Adding dataset:", dataset);

        try {
            store.dispatch(
                addDataToMap({
                    datasets: [dataset],
                    options: {
                        centerMap: true,
                        readOnly: false,
                        keepExistingConfig: false,
                    },
                    config: {}, // Start with empty config
                }),
            );
            console.log("Current store state:", store.getState());
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
            if (store.getState().keplerGl.kepler) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });
}

renderKeplerApp();
