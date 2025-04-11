import axios from "axios";
import katex from "katex";
import "katex/dist/katex.min.css";

// Access container element
const appElement = document.querySelector("#app");

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
            dataset_content: "c = \\pm\\sqrt{a^2 + b^2}",
        },
    };

    // Attach config to the data-incoming attribute
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");
const root = incoming.root;
const visualizationConfig = incoming.visualization_config || {};

function datasetsGetUrl(root, datasetId) {
    return `${root}api/datasets/${datasetId}/display`;
}

async function render() {
    let datasetContent = "";
    if (visualizationConfig.dataset_id) {
        const datasetUrl = datasetsGetUrl(root, visualizationConfig.dataset_id);
        const { data } = await axios.get(datasetUrl);
        datasetContent = data;
    } else {
        datasetContent = visualizationConfig.dataset_content;
    }
    appElement.innerHTML = katex.renderToString(datasetContent, {
        throwOnError: false,
    });
}

render();
