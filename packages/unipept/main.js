import axios from "axios";
import "./main.css";
import { Treemap, Sunburst, Treeview } from "unipept-visualizations";

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
const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;

const dataUrl = `${root}api/datasets/${datasetId}/display`;

const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

let currentVisualization = null;
let visualizationData = null;

async function create() {
    showMessage("Loading...");

    try {
        const container = document.createElement("div");
        container.className = "outer-frame";
        container.innerHTML = `
            <div class="tab">
                <a class="button" href="javascript:void(0)" data-rel="treeview">Treeview</a>
                <a class="button" href="javascript:void(0)" data-rel="sunburst">Sunburst</a>
                <a class="button" href="javascript:void(0)" data-rel="treemap">Treemap</a>
            </div>
            <div id="visualization-container" class="content-container"></div>
        `;

        appElement.appendChild(container);

        document.querySelectorAll(".button").forEach((button) => {
            button.addEventListener("click", (e) => {
                e.preventDefault();
                document.querySelectorAll(".button").forEach((btn) => btn.classList.remove("active"));
                button.classList.add("active");
                const width = window.innerWidth;
                const height = window.innerHeight;
                renderVisualization(button.dataset.rel, width, height);
            });
        });

        window.addEventListener("resize", () => {
            const activeButton = document.querySelector(".button.active");
            if (activeButton) {
                const width = window.innerWidth;
                const height = window.innerHeight;
                renderVisualization(activeButton.dataset.rel, width, height);
            }
        });

        visualizationData = await getData(dataUrl);
        document.querySelector(".button[data-rel='treeview']").click();
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

function renderVisualization(type, width, height) {
    const container = document.getElementById("visualization-container");
    container.innerHTML = "";
    if (visualizationData) {
        if (type === "treeview") {
            currentVisualization = new Treeview(container, visualizationData, {
                width,
                height,
            });
        } else if (type === "sunburst") {
            currentVisualization = new Sunburst(container, visualizationData, {
                width,
                height,
                radius: Math.min(width, height) / 2,
            });
        } else if (type === "treemap") {
            currentVisualization = new Treemap(container, visualizationData, {
                width,
                height,
            });
        }
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
