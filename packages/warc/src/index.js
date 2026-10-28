import upstreamHtml from "../vendor/index.html?raw";
import "../vendor/style.css";
import "./style.css";
import { createExplorer } from "../vendor/app.js";
import { openDataset } from "./source.js";
import { previewPayload } from "./preview.js";

const TEST_DATASET_URL = "https://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.warc.gz";

const app = document.getElementById("app");
if (import.meta.env.DEV && !app.dataset.incoming) {
    app.dataset.incoming = JSON.stringify({
        root: "/",
        visualization_config: {
            dataset_id:
                new URL(window.location.href).searchParams.get("dataset_id") || process.env.dataset_id || "__test__",
        },
    });
}

// Keep upstream's markup without executing its standalone script tags.
const template = document.createElement("template");
template.innerHTML = upstreamHtml;
app.appendChild(template.content.querySelector(".app"));
document.getElementById("statusLeft").setAttribute("role", "status");
const banner = document.createElement("div");
banner.id = "message";
banner.setAttribute("role", "alert");
banner.hidden = true;
banner.addEventListener("click", () => {
    banner.hidden = true;
});
app.append(banner);

let root;
const lifetime = new AbortController();
function showError(error) {
    banner.textContent = error.message;
    banner.hidden = false;
}
const explorer = createExplorer({
    previewPayload(bytes, type) {
        try {
            previewPayload(bytes, type);
        } catch (error) {
            showError(error);
        }
    },
});

async function jsonRequest(path) {
    const response = await fetch(`${root}${path}`, {
        credentials: "same-origin",
        signal: lifetime.signal,
    });
    if (!response.ok) throw new Error(`Galaxy request failed: HTTP ${response.status}`);
    return response.json();
}

async function init() {
    try {
        const incoming = JSON.parse(app.dataset.incoming || "{}");
        root = incoming.root || "/";
        const datasetId = incoming.visualization_config?.dataset_id;
        if (!datasetId) throw new Error("No dataset_id was provided by Galaxy.");
        let datasetName;
        let url;
        if (datasetId === "__test__") {
            datasetName = "1.warc.gz";
            url = TEST_DATASET_URL;
        } else {
            const datasetPath = `api/datasets/${encodeURIComponent(datasetId)}`;
            const dataset = await jsonRequest(datasetPath);
            datasetName = dataset.name || "WARC dataset";
            if (dataset.state && dataset.state !== "ok")
                throw new Error(`This dataset is not ready to view (state: ${dataset.state}).`);
            url = `${root}${datasetPath}/display`;
        }
        explorer.setStatus(`Loading ${datasetName}…`, true);
        const source = await openDataset(url, { signal: lifetime.signal });
        await explorer.open(source, datasetName);
    } catch (error) {
        if (error.name !== "AbortError") {
            showError(error);
            explorer.setStatus(`Error: ${error.message}`, false);
        }
    }
}

window.addEventListener(
    "pagehide",
    () => {
        lifetime.abort();
        explorer.destroy();
    },
    { once: true },
);
init();
