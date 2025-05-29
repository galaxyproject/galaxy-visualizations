import axios from "axios"
import "./index.css"
import "./mvpapp.js"

const appElement = document.querySelector("#app")
const incoming = JSON.parse(appElement.dataset.incoming || "{}")
const datasetId = incoming.visualization_config.dataset_id
const root = incoming.root
const metaUrl = `${root}api/datasets/${datasetId}`

const messageElement = document.createElement("div")
messageElement.id = "message"
messageElement.style.display = "none"
appElement.appendChild(messageElement)

function buildInterface() {
    const modal = document.createElement("div")
    modal.id = "master_modal"
    appElement.appendChild(modal)

    const nav = document.createElement("nav")
    nav.className = "navbar navbar-fixed-top"
    nav.innerHTML = `
        <div class="container">
            <div class="navbar-header">
                <a class="navbar-brand" href="#">MVP Viewer
                    <span id="mvp_help" class="fa fa-question" style="padding: 5px"></span>
                    <span class="sr-only">Help?</span>
                    <span id="mvp_config" class="fa fa-cog" style="padding: 5px"></span>
                </a>
            </div>
            <div id="user_btns">
                <div id="app_btns" class="btn-group" role="group">
                    <button id="fdr_module" class="btn btn-primary navbar-btn" disabled title="Distribution of spectral matching identification scores">ID Scores</button>
                    <button id="score_defaults" class="btn btn-primary navbar-btn" disabled title="Select identification features for display">ID Features</button>
                    <button id="scans-to-galaxy" class="btn btn-primary navbar-btn" title="Exports list of verified PSMs to active history">Export Scans <span id="scan-count-badge" class="badge">0</span></button>
                    <button id="clear_scans" class="btn btn-primary navbar-btn" disabled title="Clears all scans">Clear all Scans</button>
                    <button id="mvp_full_window" class="btn btn-primary navbar-btn" title="Open MVP in a new window."><span class="tip-help">Window</span></button>
                </div>
            </div>
        </div>
    `
    appElement.appendChild(nav)

    const container = document.createElement("div")
    container.className = "container"
    container.innerHTML = `
        <div id="igvDiv"></div>
        <div id="protein_viewer"></div>
        <div id="score_default_div"></div>
        <div id="progress-div"></div>
        <div class="row">
            <div class="col-md-12"><h3 id="dataset_name"></h3></div>
        </div>
        <div class="row" id="overview_row"><div id="overview_div" class="col-md-12"></div></div>
        <div class="row"><div id="score_filter_div" class="col-md-12"></div></div>
        <div class="row"><div id="detail_div" class="col-md-12"></div></div>
        <div class="row"><div id="lorikeet_zone" class="col-md-12"></div></div>
        <div id="fdr_div"></div>
    `
    appElement.appendChild(container)
}

function showMessage(title, details = null) {
    messageElement.innerHTML = `${title}${details ? `: ${details}` : ""}`
    messageElement.style.display = "inline"
    console.debug(messageElement.innerHTML)
}

function hideMessage() {
    messageElement.style.display = "none"
}

async function getData(url) {
    try {
        const { data } = await axios.get(url)
        return data
    } catch (e) {
        showMessage("Failed to retrieve data", e)
    }
}

async function create() {
    showMessage("Loading...")
    buildInterface()
    const dataset = await getData(metaUrl)
    if (dataset.metadata_table_row_count) {
        const config = {
            datasetID: datasetId,
            dataName: dataset.name,
            dbkey: dataset.dbkey || "?",
            href: root,
            historyID: dataset.history_id,
            tableRowCount: { ...dataset.metadata_table_row_count },
        }
        MVPApplication.run(config)
        hideMessage()
    } else {
        showMessage("No columns found in dataset")
    }
}

create()
