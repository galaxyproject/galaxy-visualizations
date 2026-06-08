import axios from "axios";
import parse from "seqparse";
import { Viewer } from "seqviz";
import "./index.css";

const TEST_DATA_FILE = "test-data/test.fasta";
const TEST_DATA_EXTENSION = "fasta";

const MESSAGE_LOADING = "#3b82f6";
const MESSAGE_ERROR = "#ef4444";

const appElement = document.querySelector("#app");

if (import.meta.env.DEV) {
    const pageUrl = new URL(window.location.href);
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: pageUrl.searchParams.get("dataset_id") || process.env.dataset_id || "__test__",
            settings: {},
        },
    };
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

function getDatasetId() {
    return incoming?.visualization_config?.dataset_id || "";
}

function getRoot() {
    return incoming?.root || "";
}

function getSettings() {
    return incoming?.visualization_config?.settings || {};
}

function showMessage(text, color = MESSAGE_LOADING) {
    if (!messageElement) return;
    messageElement.innerHTML = text;
    messageElement.style.background = color;
    messageElement.style.color = "#fff";
    messageElement.style.display = "block";
}

function hideMessage() {
    if (messageElement) {
        messageElement.style.display = "none";
    }
}

function showError(text) {
    showMessage(`<strong>Error:</strong> ${text}`, MESSAGE_ERROR);
    console.error(`[seqviz] ${text}`);
}

let messageElement;

function createUI() {
    messageElement = document.createElement("div");
    messageElement.id = "message";
    appElement.appendChild(messageElement);

    const containerElement = document.createElement("div");
    containerElement.id = "seqviz-container";
    appElement.appendChild(containerElement);
}

function renderSeqViz(seqData, viewerMode, showAnnotations = true) {
    if (!seqData.seq || seqData.seq.length === 0) {
        showError("Sequence data is empty");
        return;
    }

    hideMessage();

    const container = document.getElementById("seqviz-container");
    if (!container) {
        showError("Container element not found");
        return;
    }

    let annotations = seqData.annotations || [];
    if (!showAnnotations) {
        annotations = [];
    }

    const settings = {};
    if (viewerMode && viewerMode !== "both") {
        settings.viewer = viewerMode;
    }

    try {
        const viewer = Viewer(container, {
            name: seqData.name || "Unknown",
            seq: seqData.seq,
            annotations: annotations,
            style: { height: "100%", width: "100%" },
            ...settings,
        });

        viewer.render();
        hideMessage();
    } catch (e) {
        showError(`Failed to render viewer: ${e.message}`);
    }
}

async function fetchContent(root, datasetId) {
    if (datasetId && datasetId !== "__test__") {
        showMessage("Loading sequence data from Galaxy...");
        const metaUrl = `${root}api/datasets/${datasetId}`;
        const displayUrl = `${root}api/datasets/${datasetId}/display`;
        const { data: metadata } = await axios.get(metaUrl);
        const { data: content } = await axios.get(displayUrl);
        return { metadata, content };
    }
    showMessage(`Loading test data from ${TEST_DATA_FILE}...`);
    const { data: content } = await axios.get(TEST_DATA_FILE, { responseType: "text" });
    return { metadata: { extension: TEST_DATA_EXTENSION }, content };
}

async function initializeFromContent(root, datasetId) {
    try {
        const { metadata, content } = await fetchContent(root, datasetId);
        const fileName = metadata.extension ? `seq.${metadata.extension}` : "seq.txt";
        const seqData = await parse(content, { fileName });
        const settings = getSettings();
        const viewerMode = settings.viewer || "both";
        const showAnnotations = settings.show_annotation_lines !== false;
        renderSeqViz(seqData, viewerMode, showAnnotations);
    } catch (e) {
        console.error(`[seqviz] Initialization error:`, e.message);
        showError(`Failed to load sequence: ${e.message}`);
    }
}

createUI();
const datasetId = getDatasetId();
const root = getRoot();
console.debug(`[seqviz] Initializing with dataset_id: ${datasetId || "none"}, root: ${root || "none"}`);
initializeFromContent(root, datasetId);
