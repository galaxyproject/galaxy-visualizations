import axios from "axios";
import ace from "ace-builds";
import "ace-builds/src-noconflict/ace";
import "ace-builds/src-noconflict/mode-powershell";
import "ace-builds/src-noconflict/theme-textmate";
import "./main.css";

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

/** Now you can consume the incoming data in your application.
 * In this example, the data was attached in the development mode block.
 * In production, this data will be provided by Galaxy.
 */
const datasetId = incoming.visualization_config.dataset_id;
const datasetUrl = incoming.visualization_config.dataset_url;
const root = incoming.root;

/* Build the data request url. Modify the API route if necessary. */
const url = datasetUrl || `${root}api/datasets/${datasetId}/display`;

/* Build and attach message element */
const messageElement = document.createElement("div");
messageElement.id = "message";
appElement.appendChild(messageElement);

/* Declare export function */
function exportData(urlPaste, metaData) {
    const upload_data = {
        tool_id: "upload1",
        history_id: metaData.history_id,
        inputs: {
            file_count: 1,
            file_type: "auto",
            "files_0|file_type": "auto",
            "files_0|url_paste": urlPaste,
            "files_0|NAME": `${metaData.name} (modified)`,
        },
    };
    try {
        const request = new XMLHttpRequest();
        request.open("POST", `${root}api/tools`);
        request.setRequestHeader("Content-Type", "application/json");
        request.send(JSON.stringify(upload_data));
        request.onreadystatechange = () => {
            if (request.readyState === XMLHttpRequest.DONE) {
                var status = request.status;
                if (status === 0 || (200 >= status && status < 400)) {
                    console.log("File submitted.");
                } else {
                    showError("Exporting failed.", status);
                }
            }
        };
        hideError();
    } catch (e) {
        showError(e);
    }
}

/* Add button */
async function addExportButton(aceEditor) {
    try {
        const { data: metaData } = await axios.get(`${root}api/datasets/${datasetId}`);
        const buttonElement = document.createElement("button");
        buttonElement.id = "export-btn";
        buttonElement.textContent = "export";
        buttonElement.onclick = () => exportData(aceEditor.getValue(), metaData);
        appElement.appendChild(buttonElement);
    } catch (e) {
        showError("Failed loading metadata", e);
    }
}

/* Create Editor */
async function create() {
    try {
        // build editor element
        const editorElement = document.createElement("div");
        editorElement.id = "editor";
        appElement.appendChild(editorElement);

        // create and attach editor
        const { data } = await axios.get(url, { responseType: "text" });
        const aceEditor = ace.edit(editorElement, {
            mode: "ace/mode/powershell",
            theme: "ace/theme/textmate",
        });
        aceEditor.setValue(data, -1);

        // build and attach button
        addExportButton(aceEditor);
    } catch (e) {
        showError("Failed creating editor", e);
    }
}

function showError(title, err) {
    messageElement.innerHTML = `<strong>${title}: ${err}</strong>`;
    messageElement.style.display = "inline";
    console.error(`Error loading: ${err}`);
}

function hideError() {
    messageElement.style.display = "none";
}

create();
