// src/main.jsx
import React, { useEffect, useState } from "react";
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
            dataset_url: process.env.dataset_id ? undefined : "geolocation.csv",
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

// Responsive wrapper component
function KeplerApp({ store }) {
    const [size, setSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });

    useEffect(() => {
        const handleResize = () => {
            setSize({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <Provider store={store}>
            <div style={{ width: `${size.width}px`, height: `${size.height}px`, overflow: "hidden" }}>
                <KeplerGl id="map" mapboxApiAccessToken={null} width={size.width} height={size.height} />
            </div>
        </Provider>
    );
}

// Main async render logic
async function render() {
    try {
        const dataset = await loadDataset(url);
        const rootElement = createRoot(appElement);
        const store = storeFactory(dataset);
        rootElement.render(<KeplerApp store={store} />);
    } catch (err) {
        console.error(err);
        appElement.innerHTML = `<div><h3>Failed loading dataset!</h3><p>${err.message}</p></div>`;
    }
}

render();
