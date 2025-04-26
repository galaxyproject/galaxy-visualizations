import axios from "axios";
import "./main.css";
import A from "aladin-lite";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
        },
    };
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

const dataUrl = `${root}api/datasets/${datasetId}/display`;
const metaUrl = `${root}api/datasets/${datasetId}`;

const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

async function create() {
    showMessage("Loading...");

    try {
        const dataset = await getData(metaUrl);

        const supportedFormats = ["fits"];

        if (supportedFormats.includes(dataset.extension.toLowerCase())) {
            const viewerElement = document.createElement("div");
            viewerElement.id = "aladin-lite-viewer";
            viewerElement.style.width = "100%";
            viewerElement.style.height = "100vh";
            appElement.appendChild(viewerElement);

            A.init.then(() => {
                const aladin = A.aladin("#aladin-lite-viewer", { showCooGridControl: true });
                aladin.displayFITS(dataUrl);
                aladin.showCooGrid(true);
            });

            hideMessage();
        } else {
            showMessage(
                `Unsupported image format: ${dataset.extension}. Supported formats: ${supportedFormats.join(", ")}`,
            );
        }
    } catch (error) {
        showMessage("Error loading dataset", error.message);
    }
}

async function getData(url) {
    try {
        const { data } = await axios.get(url);
        return data;
    } catch (e) {
        showMessage("Failed to retrieve data", e.message);
        throw e;
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
