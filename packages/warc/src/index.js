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
document.querySelector(".titlebar .hint").textContent = "— Inspect a Galaxy web archive";
document.querySelector(".file-actions").hidden = true;
const fileHint = document.querySelector("#fileTree .empty-hint");
if (fileHint) fileHint.textContent = "Loading history dataset…";
document.getElementById("statusLeft").setAttribute("role", "status");
const banner = document.createElement("div");
banner.id = "galaxy-message";
banner.setAttribute("role", "alert");
banner.hidden = true;
document.querySelector(".panes").before(banner);
const save = document.createElement("button");
save.id = "save-view";
save.textContent = "Save view";
save.disabled = true;
document.querySelector(".titlebar-right").prepend(save);

let incoming;
let root;
let datasetId;
let visualizationId;
let datasetName;
let ready = false;
let dirty = false;
let changeVersion = 0;
let saving = false;
const lifetime = new AbortController();
function reportSaved(saved) {
    window.parent?.postMessage(
        { from: "galaxy-visualization", visualization_saved: saved },
        URL.canParse(root) ? new URL(root).origin : "*",
    );
}
function showError(error) {
    banner.textContent = error.message;
    banner.hidden = false;
}
const explorer = createExplorer({
    onChange() {
        if (!ready) return;
        changeVersion++;
        dirty = true;
        save.textContent = "Save view";
        reportSaved(false);
    },
    previewPayload(bytes, type) {
        try {
            previewPayload(bytes, type);
        } catch (error) {
            showError(error);
        }
    },
});

async function jsonRequest(path, options = {}) {
    const response = await fetch(`${root}${path}`, {
        credentials: "same-origin",
        signal: lifetime.signal,
        ...options,
    });
    if (!response.ok) throw new Error(`Galaxy request failed: HTTP ${response.status}`);
    return response.json();
}

async function init() {
    try {
        incoming = JSON.parse(app.dataset.incoming || "{}");
        root = incoming.root || "/";
        datasetId = incoming.visualization_config?.dataset_id;
        visualizationId = incoming.visualization_id;
        if (!datasetId) throw new Error("No dataset_id was provided by Galaxy.");
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
        if (!(await explorer.open(source, datasetName))) return;
        await explorer.restore(incoming.visualization_config || {});
        ready = true;
        save.disabled = false;
        reportSaved(true);
    } catch (error) {
        if (error.name !== "AbortError") {
            showError(error);
            explorer.setStatus(`Error: ${error.message}`, false);
        }
    }
}

save.addEventListener("click", async () => {
    if (!ready || saving) return;
    saving = true;
    save.disabled = true;
    banner.hidden = true;
    const version = changeVersion;
    try {
        const payload = {
            title: incoming.visualization_title || `WARC Explorer: ${datasetName}`,
            config: { dataset_id: datasetId, ...explorer.getView() },
            ...(!visualizationId ? { type: "warc" } : {}),
        };
        const result = await jsonRequest(
            visualizationId ? `api/visualizations/${encodeURIComponent(visualizationId)}` : "api/visualizations",
            {
                method: visualizationId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            },
        );
        visualizationId = result.id;
        dirty = version !== changeVersion;
        save.textContent = dirty ? "Save view" : "Saved";
        reportSaved(!dirty);
    } catch (error) {
        showError(error);
    } finally {
        saving = false;
        save.disabled = false;
    }
});

window.addEventListener("beforeunload", (event) => {
    if (dirty) {
        event.preventDefault();
    }
});
window.addEventListener(
    "pagehide",
    () => {
        lifetime.abort();
        explorer.destroy();
    },
    { once: true },
);
init();
