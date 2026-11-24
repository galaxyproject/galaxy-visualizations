import "./index.css";

const TEST_DATA_FILE = "test-data/1.newick";

const appElement = document.getElementById("app");

if (import.meta.env.DEV) {
    const pageUrl = new URL(window.location.href);
    appElement.dataset.incoming = JSON.stringify({
        root: "/",
        visualization_config: {
            dataset_id: pageUrl.searchParams.get("dataset_id") || process.env.dataset_id || "__test__",
        },
    });
}

const incoming = JSON.parse(appElement.dataset.incoming || "{}");
const root = incoming.root || "/";
const datasetId = incoming.visualization_config?.dataset_id;
const title = incoming.visualization_title || "Galaxy dataset";

const viewerUrl = import.meta.env.DEV
    ? new URL("/viewer/index.html", window.location.href)
    : new URL(/* @vite-ignore */ "viewer/index.html", import.meta.url);
viewerUrl.searchParams.set("btv_api", "1");

appElement.innerHTML = `
  <div id="bt-error"></div>
  <div id="bt-status">Loading dataset…</div>
  <iframe id="bt-viewer" title="Big Tree Viewer"></iframe>
`;

const errorElement = document.getElementById("bt-error");
const statusElement = document.getElementById("bt-status");
const viewerElement = document.getElementById("bt-viewer");

function showError(message) {
    errorElement.textContent = message;
    errorElement.style.display = "block";
    setStatus("");
}

function setStatus(message) {
    statusElement.textContent = message;
    statusElement.style.display = message ? "block" : "none";
}

async function fetchTree() {
    const url = datasetId === "__test__" ? TEST_DATA_FILE : `${root}api/datasets/${datasetId}/display`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.text();
}

function waitForViewer() {
    return new Promise((resolve) => {
        window.addEventListener("message", (event) => {
            if (event.source === viewerElement.contentWindow && event.data?.type === "big-tree-viewer:ready") {
                resolve();
            }
        });
        viewerElement.src = viewerUrl.href;
    });
}

window.addEventListener("message", (event) => {
    if (event.source !== viewerElement.contentWindow) {
        return;
    }
    if (event.data?.type === "big-tree-viewer:loaded") {
        setStatus("");
    } else if (event.data?.type === "big-tree-viewer:error") {
        showError(`Could not display tree: ${event.data.message}`);
    }
});

async function init() {
    if (!datasetId) {
        showError("No dataset_id provided by Galaxy.");
        return;
    }
    let newick;
    try {
        [newick] = await Promise.all([fetchTree(), waitForViewer()]);
    } catch (err) {
        showError(`Could not fetch dataset: ${err.message}`);
        return;
    }
    setStatus("Drawing tree…");
    viewerElement.contentWindow.postMessage(
        { type: "big-tree-viewer:load", payload: { newick, label: title } },
        viewerUrl.origin,
    );
}

init();
