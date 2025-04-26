import axios from "axios";
import "./main.css";
import OpenSeadragon from "openseadragon";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
        },
    };

    // Attach config to the data-incoming attribute
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

/* Build the data request url */
const dataUrl = `${root}api/datasets/${datasetId}/display`;
const metaUrl = `${root}api/datasets/${datasetId}`;

/* Build and attach message element */
const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

async function create() {
    showMessage("Loading...");

    try {
        const dataset = await getData(metaUrl);

        // Supported image formats for OpenSeadragon
        const supportedFormats = ["tiff", "jpeg", "jpg", "png", "dzi", "iiif"];

        if (supportedFormats.includes(dataset.extension.toLowerCase())) {
            // Create container for OpenSeadragon
            const viewerElement = document.createElement("div");
            viewerElement.id = "openseadragon-viewer";
            viewerElement.style.width = "100%";
            viewerElement.style.height = "100vh";
            appElement.appendChild(viewerElement);

            // Initialize OpenSeadragon
            const viewer = OpenSeadragon({
                id: "openseadragon-viewer",
                prefixUrl: "https://cdn.jsdelivr.net/npm/openseadragon@3.1/build/openseadragon/images/",
                tileSources: {
                    type: "image",
                    url: dataUrl,
                },
                showNavigationControl: true,
                showZoomControl: true,
                showHomeControl: true,
                showFullPageControl: true,
                gestureSettingsMouse: {
                    clickToZoom: true,
                    dblClickToZoom: true,
                    pinchToZoom: true,
                    scrollToZoom: true,
                },
            });

            viewer.addHandler("open-failed", function (event) {
                showMessage("Failed to load image", event.message);
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
    console.error(`${title}${details}`);
}

function hideMessage() {
    messageElement.style.display = "none";
}

create();
