import "hyphy-vision/dist/application.scss";
import * as hyphyVision from "hyphy-vision";

import "./main.css";
import determineHyPhyMethod from "./helper.js";

const TEST_DATA = "test-data/1.hyphy_results.json";

const appElement = document.getElementById("app");
const incoming = JSON.parse(appElement.dataset.incoming || "{}");
const datasetId = incoming.visualization_config && incoming.visualization_config.dataset_id;
const root = incoming.root || "/";

const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

const containerElement = document.createElement("div");
containerElement.id = "hyphyvision-root";
appElement.appendChild(containerElement);

function renderHyPhyVision(data, element) {
    const method = determineHyPhyMethod(data);
    if (method) {
        hyphyVision[method](data, element);
    } else {
        showMessage("Failed to match method.");
    }
}

async function create() {
    showMessage("Please wait...");
    try {
        const url = datasetId ? `${root}api/datasets/${datasetId}/display?to_ext=json` : TEST_DATA;
        const response = await fetch(url);
        const data = await response.json();
        renderHyPhyVision(data, containerElement.id);
        if (!datasetId) {
            showMessage(`TEST_DATA: ${url}`);
        } else {
            hideMessage();
        }
    } catch (error) {
        console.log(error);
        showMessage("Error loading dataset", error.message || String(error));
    }
}

function showMessage(title, details = null) {
    details = details ? `: ${details}` : "";
    messageElement.innerHTML = `<strong>${title}${details}</strong>`;
    messageElement.style.display = "inline";
    console.debug(`${title}${details}`);
}

function hideMessage() {
    messageElement.style.display = "none";
}

create();
