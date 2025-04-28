var $ = require('jquery');
window.$ = $;
window.jQuery = $;

// Import Drawrna core
var Drawrna = require("./drawrna"); // <-- the file you posted

// Access container element
const appElement = document.querySelector("#app");

// Access attached data
const incoming = JSON.parse(appElement.getAttribute("data-incoming") || "{}");

const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

const dataUrl = `${root}api/datasets/${datasetId}/display`;

const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

async function create() {
    showMessage("Loading...");
    try {
        const targetElement = document.createElement("div");
        targetElement.id = "target";
        appElement.appendChild(targetElement);

        //const dataset = await getData(dataUrl);

        new Drawrna({
            el: targetElement,
            seq: "GGGAAACCC",
            dotbr: "(((...)))",
            layout: "naview",
            seqpanel: false,
            optspanel: false
        }).render();
        hideMessage();
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
