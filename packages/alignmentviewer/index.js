import React from "react";
import { createRoot } from "react-dom/client";
import { AlignmentViewer } from "./src/components/AlignmentViewerHook";
import { FastaAlignment } from "./src/common/FastaAlignment";
import { StockholmAlignment } from "./src/common/StockholmAlignment";

import "./index.css";

const appElement = document.getElementById("app");
if (!appElement) {
  throw new Error("No #app element found");
}

// Parse incoming data
const incoming = JSON.parse(appElement.getAttribute("data-incoming") || "{}");
const datasetId = incoming.visualization_config?.dataset_id;
const rootPath = incoming.root || "";
const dataUrl = datasetId ? `${rootPath}api/datasets/${datasetId}/display` : null;

// Create message element
const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

// Create viewer container
const viewerElement = document.createElement("div");
viewerElement.id = "viewer";
appElement.appendChild(viewerElement);

// Message helpers
function showMessage(title, details = null) {
  details = details ? `: ${details}` : "";
  messageElement.innerHTML = `<strong>${title}${details}</strong>`;
  messageElement.style.display = "inline";
  console.debug(`${title}${details}`);
}
function hideMessage() {
  messageElement.style.display = "none";
}

// Initialize viewer
async function initViewer() {
  try {
    showMessage("Please wait...");
    let fileContent = null;

    if (dataUrl) {
      const response = await fetch(dataUrl);
      fileContent = await response.text();
    }

    if (!fileContent) {
      showMessage("Provided dataset is invalid.");
    }

    const reader = fileContent[0] === ">" ? FastaAlignment : StockholmAlignment;
    const alignmentObj = reader.fromFileContents(datasetId, fileContent);

    hideMessage();
    const root = createRoot(viewerElement);
    root.render(<AlignmentViewer alignment={alignmentObj} />);
  } catch (e) {
    showMessage("Error loading dataset", e.message);
  }
}

initViewer();
