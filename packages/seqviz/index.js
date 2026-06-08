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

const incoming = JSON.parse(appElement.getAttribute("data-incoming") || "{}");
const datasetId = incoming?.visualization_config?.dataset_id || "";
const root = incoming?.root || "";
const settings = incoming?.visualization_config?.settings || {};

let messageElement;

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

function createUI() {
    messageElement = document.createElement("div");
    messageElement.id = "message";
    appElement.appendChild(messageElement);

    const containerElement = document.createElement("div");
    containerElement.id = "seqviz-container";
    appElement.appendChild(containerElement);
}

async function fetchUrl(url, format = "text") {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    return response[format]();
}

async function fetchContent() {
    if (datasetId && datasetId !== "__test__") {
        showMessage("Loading sequence data from Galaxy...");
        const metadata = await fetchUrl(`${root}api/datasets/${datasetId}`, "json");
        const content = await fetchUrl(`${root}api/datasets/${datasetId}/display`);
        return { metadata, content };
    }
    showMessage(`Loading test data from ${TEST_DATA_FILE}...`);
    const content = await fetchUrl(TEST_DATA_FILE);
    return { metadata: { extension: TEST_DATA_EXTENSION }, content };
}

function renderSeqViz(seqData) {
    if (!seqData.seq) {
        showError("Sequence data is empty");
        return;
    }
    hideMessage();
    const viewerMode = settings.viewer || "both";
    const showAnnotations = settings.show_annotation_lines !== false;
    const viewerProps = {
        name: seqData.name,
        seq: seqData.seq,
        annotations: showAnnotations ? seqData.annotations || [] : [],
        style: { height: "100%", width: "100%" },
    };
    if (viewerMode !== "both") {
        viewerProps.viewer = viewerMode;
    }
    try {
        Viewer(document.getElementById("seqviz-container"), viewerProps).render();
    } catch (e) {
        showError(`Failed to render viewer: ${e.message}`);
    }
}

async function initialize() {
    createUI();
    try {
        const { metadata, content } = await fetchContent();
        const fileName = metadata.extension ? `seq.${metadata.extension}` : "seq.txt";
        const seqData = await parse(content, { fileName });
        renderSeqViz(seqData);
    } catch (e) {
        showError(`Failed to load sequence: ${e.message}`);
    }
}

initialize();
