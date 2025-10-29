import "hyphy-vision/dist/hyphyvision.css";
import * as hyphyVision from "hyphy-vision";
window.renderHyPhyVision = hyphyVision.renderHyPhyVision;
window.render_branch_selection = hyphyVision.render_branch_selection;

const TEST_DATASET =
    "https://raw.githubusercontent.com/veg/hyphy-vision/refs/heads/master/data/json_files/absrel/CD2.fna.ABSREL.json";

const appElement = document.getElementById("app");
const incoming = JSON.parse(appElement.dataset.incoming || "{}");
const datasetId = incoming.visualization_config.dataset_id || "__test__";
const root = incoming.root;

const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

const rootDiv = document.createElement("div");
rootDiv.id = "hyphy-vision-root";
appElement.appendChild(rootDiv);

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = false;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function create() {
    showMessage("Please wait...");
    try {
        const url = datasetId === "__test__" ? TEST_DATASET : `${root}api/datasets/${datasetId}/display?to_ext=json`;
        window.renderHyPhyVision(url, "hyphy-vision-root");
        hideMessage();
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

