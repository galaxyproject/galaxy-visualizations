import * as React from "react";
import ReactDOM from "react-dom";
import { AlignmentViewer, FastaAlignment } from "alignment-viewer-2";
import "./main.css";

const appElement = document.querySelector("#app");

if (import.meta.env.DEV) {
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id,
        },
    };
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");
const datasetId = incoming.visualization_config?.dataset_id;
const root = incoming.root || "";
const dataUrl = datasetId ? `${root}api/datasets/${datasetId}/display` : null;

const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

const viewerElement = document.createElement("div");
viewerElement.id = "viewer";
appElement.appendChild(viewerElement);

function App() {
    const [alignment, setAlignment] = React.useState(null);
    const [error, setError] = React.useState(null);

    React.useEffect(() => {
        async function fetchData() {
            try {
                showMessage("Please wait...");
                const response = await fetch(dataUrl);
                const fastaText = await response.text();
                const alignmentObj = FastaAlignment.fromFileContents("Dataset", fastaText);
                setAlignment(alignmentObj);
            } catch (e) {
                setError(e.message);
                showMessage(`Error loading dataset: ${e.message}`);
            }
        }
        fetchData();
    }, []);

    if (error) {
        showMessage(`Error loading dataset: ${error}`);
    } else if (!alignment) {
        showMessage("Loading alignment...");
    } else {
        hideMessage();
        return <AlignmentViewer alignment={alignment} />;
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

ReactDOM.render(<App />, viewerElement);
