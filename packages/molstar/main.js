import axios from "axios";
import "./main.css";
import "molstar/build/viewer/molstar.css";
import { Viewer } from "molstar/lib/apps/viewer/app";

const appElement = document.querySelector("#app");

if (import.meta.env.DEV) {
    const pageUrl = new URL(window.location.href);
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: pageUrl.searchParams.get("dataset_id") || process.env.dataset_id || "__test__",
        },
    };
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

const dataUrl = `${root}api/datasets/${datasetId}/display`;
const metaUrl = `${root}api/datasets/${datasetId}`;

const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

function mapToMolstarFormat(ext) {
    switch (ext) {
        case "cif":
            return "mmcif";
        case "pqr":
            return "pdb";
        default:
            return ext;
    }
}

async function create() {
    showMessage("Please wait...");

    try {
        const dataset = await getData(metaUrl);

        const supportedFormats = ["pdb", "pqr", "cif", "bcif", "mol", "mol2", "sdf", "xyz", "gro", "top", "traj"];

        const extension = dataset.extension.toLowerCase();

        if (supportedFormats.includes(extension)) {
            const viewerElement = document.createElement("div");
            viewerElement.id = "molstar-viewer";
            viewerElement.style.width = "100%";
            viewerElement.style.height = "100vh";
            appElement.appendChild(viewerElement);

            const loadFormat = mapToMolstarFormat(extension);

            const viewer = await Viewer.create(viewerElement);
            await viewer.loadStructureFromUrl(dataUrl, loadFormat);

            hideMessage();
        } else {
            showMessage(
                `Unsupported dataset format: ${dataset.extension}. Supported formats: ${supportedFormats.join(", ")}`,
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
