import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import "./main.css";
import Alignment from "alignment.js/Alignment.js";
import * as colors from "alignment.js/helpers/colors.js";

const DELAY = 200;

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

const viewerElement = document.createElement("div");
viewerElement.id = "viewer";
viewerElement.style.width = "100%";
viewerElement.style.height = "100vh";
appElement.appendChild(viewerElement);

function ResizableAlignment({ fasta }) {
    const [dimensions, setDimensions] = React.useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });
    React.useEffect(() => {
        let timeoutId = null;
        function handleResize() {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                setDimensions({
                    width: viewerElement.clientWidth,
                    height: viewerElement.clientHeight,
                });
            }, DELAY);
        }
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener("resize", handleResize);
        };
    }, []);
    const key = `${dimensions.width}x${dimensions.height}`;
    return (
        <Alignment
            key={key}
            fasta={fasta}
            width={dimensions.width}
            height={dimensions.height}
            site_color={colors.amino_acid_color}
            text_color={colors.amino_acid_text_color}
        />
    );
}

async function create() {
    showMessage("Please wait...");
    try {
        const dataset = await getData(dataUrl);

        ReactDOM.render(<ResizableAlignment fasta={dataset} />, viewerElement);

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
