var $ = require('jquery');
window.$ = $;
window.jQuery = $;

// Import Drawrna core
var Drawrna = require("./drawrna");

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

function create() {
    showMessage("Loading...");

    const targetElement = document.createElement("div");
    targetElement.id = "target";
    appElement.appendChild(targetElement);

    getData(dataUrl)
        .then((dataset) => {
            const lines = dataset.split(/\r?\n/).filter(line => line.trim() !== "");
            if (lines.length !== 3) {
                showMessage("Expects exactly 3 lines: 1) >NAME, 2) SEQUENCE, 3) DOTBRACKET");
            } else if (lines[0][0] !== ">") {
                showMessage("Expects line 1 to start with >");
            } else {
                new Drawrna({
                    el: targetElement,
                    seq: lines[1],
                    dotbr: lines[2],
                    layout: "naview",
                    seqpanel: false,
                    optspanel: false
                }).render();
                hideMessage();
            }
        })
        .catch((error) => {
            showMessage("Error loading dataset", error);
        });
}

function getData(url) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: url,
            method: 'GET',
            dataType: 'text',
            success: function (data) {
                resolve(data);
            },
            error: function (jqXHR, textStatus, errorThrown) {
                reject(`${textStatus}: ${errorThrown}`);
            }
        });
    });
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
