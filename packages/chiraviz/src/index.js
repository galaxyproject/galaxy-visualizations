import "script-loader!jquery";
import "script-loader!underscore/underscore-min";
import "script-loader!plotly.js/dist/plotly.min";
import "script-loader!bootstrap/dist/js/bootstrap.min";
import "bootstrap/dist/css/bootstrap.min.css";
import "font-awesome/css/font-awesome.min.css";

import "./index.css";
import "script-loader!./rna-viz";
import "script-loader!./visualize-alignment";

// Access container element
const appElement = document.querySelector("#app");

// Access attached data
const incoming = JSON.parse(appElement.dataset.incoming || "{}");

const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

const metaUrl = `${root}api/datasets/${datasetId}`;

const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

function create() {
    showMessage("Loading...");

    const targetElement = document.createElement("div");
    targetElement.id = "target";
    appElement.appendChild(targetElement);

    getData(metaUrl)
        .then((meta) => {
            RNAInteractionViewer.loadData({
                href: root,
                dataName: meta.name,
                datasetID: datasetId,
                tableName: meta.metadata_tables[0],
            });
            hideMessage();
        })
        .catch((error) => {
            showMessage("Error loading dataset", error);
        });
}

function getData(url) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: url,
            method: "GET",
            dataType: "json",
            success: function (data) {
                resolve(data);
            },
            error: function (_, textStatus, errorThrown) {
                reject(`${textStatus}: ${errorThrown}`);
            },
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
