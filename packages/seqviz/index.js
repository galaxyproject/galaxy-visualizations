import axios from "axios";
import { Viewer } from "seqviz";
import "./index.css";

const TEST_DATA_FILE = "test-data/test.fasta";
const TEST_DATA_EXTENSION = "fasta";

const MESSAGE_LOADING = "#3b82f6";
const MESSAGE_ERROR = "#ef4444";

const appElement = document.querySelector("#app");

if (import.meta.env.DEV) {
    const pageUrl = new URL(window.location.href);
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: pageUrl.searchParams.get("dataset_id") || process.env.dataset_id || "__test__",
            settings: {},
        },
    };
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");

function getDatasetId() {
    return incoming?.visualization_config?.dataset_id || "";
}

function getRoot() {
    return incoming?.root || "";
}

function getSettings() {
    return incoming?.visualization_config?.settings || {};
}

function showMessage(text, color = MESSAGE_LOADING) {
    if (!messageElement) return;
    messageElement.innerHTML = text;
    messageElement.style.background = color;
    messageElement.style.color = "#fff";
    messageElement.style.display = "block";
}

function hideMessage() {
    if (messageElement) {
        messageElement.style.display = "none";
    }
}

function showError(text) {
    showMessage(`<strong>Error:</strong> ${text}`, MESSAGE_ERROR);
    console.error(`[seqviz] ${text}`);
}

let messageElement;

function createUI() {
    messageElement = document.createElement("div");
    messageElement.id = "message";
    appElement.appendChild(messageElement);

    const containerElement = document.createElement("div");
    containerElement.id = "seqviz-container";
    appElement.appendChild(containerElement);
}

function renderSeqViz(seqData, viewerMode, showAnnotations = true) {
    if (!seqData.seq || seqData.seq.length === 0) {
        showError("Sequence data is empty");
        return;
    }

    hideMessage();

    const container = document.getElementById("seqviz-container");
    if (!container) {
        showError("Container element not found");
        return;
    }

    let annotations = seqData.annotations || [];
    if (!showAnnotations) {
        annotations = [];
    }

    const settings = {};
    if (viewerMode && viewerMode !== "both") {
        settings.viewer = viewerMode;
    }

    try {
        const viewer = Viewer(container, {
            name: seqData.name || "Unknown",
            seq: seqData.seq,
            annotations: annotations,
            style: { height: "100%", width: "100%" },
            ...settings,
        });

        viewer.render();
        hideMessage();
    } catch (e) {
        showError(`Failed to render viewer: ${e.message}`);
    }
}

async function fetchContent(root, datasetId) {
    if (datasetId && datasetId !== "__test__") {
        showMessage("Loading sequence data from Galaxy...");
        const metaUrl = `${root}api/datasets/${datasetId}`;
        const displayUrl = `${root}api/datasets/${datasetId}/display`;
        const { data: metadata } = await axios.get(metaUrl);
        const { data: content } = await axios.get(displayUrl, { responseType: "text" });
        return { metadata, content };
    }
    showMessage(`Loading test data from ${TEST_DATA_FILE}...`);
    const { data: content } = await axios.get(TEST_DATA_FILE, { responseType: "text" });
    return { metadata: { extension: TEST_DATA_EXTENSION }, content };
}

function parseFasta(content) {
    const lines = content.split("\n").filter((line) => line.trim() && !line.startsWith("//"));
    if (lines.length === 0) {
        throw new Error("Invalid FASTA format: empty content");
    }

    const name = lines[0].replace(/^>/, "").split(/\s+/)[0];
    const sequence = lines.slice(1).join("").toUpperCase();

    return { name, seq: sequence };
}

function parseGenbank(content) {
    console.debug(`[seqviz] Attempting to parse GenBank format`);
    const nameMatch = content.match(/LOCUS\s+(\S+)/);

    const terminatorIndex = content.match(/^\s*\/\//m);
    if (!terminatorIndex) {
        throw new Error("Invalid GenBank format: no sequence terminator (//) found");
    }

    const sequenceText = content.substring(0, terminatorIndex.index);
    const originIndex = sequenceText.indexOf("ORIGIN");
    if (originIndex === -1) {
        throw new Error("Invalid GenBank format: no ORIGIN block found");
    }

    const name = nameMatch ? nameMatch[1] : "Unknown";

    const headerBlock = sequenceText.substring(0, originIndex);
    const sequenceBlock = sequenceText.substring(originIndex + 1);

    let sequence = "";

    try {
        const annotations = parseGenbankFeatures(headerBlock);
        for (const line of sequenceBlock.split("\n")) {
            const cleanLine = line.replace(/^\s*\d+\s*/, "").replace(/\s+/g, "");
            if (/^[ACGTURYKMSWBDHVNacgtyurkmswbdhnv]*$/.test(cleanLine) && cleanLine.length > 0) {
                sequence += cleanLine.toUpperCase();
            }
        }

        return {
            name,
            seq: sequence,
            annotations,
        };
    } catch (e) {
        console.error(`[seqviz] Annotation parsing error:`, e.message);
        return {
            name,
            seq: sequence,
            annotations: [],
        };
    }
}

function parseGenbankFeatures(headerBlock) {
    const annotations = [];

    const featureBlockMatch = headerBlock.match(/FEATURES\s+Location\/Qualifiers([\s\S]*?)(?=ORIGIN)/);
    if (!featureBlockMatch) {
        return annotations;
    }

    const featureLines = featureBlockMatch[1].split("\n");
    const featureColors = [
        "#ff6b6b",
        "#4ecdc4",
        "#45b7d1",
        "#96ceb4",
        "#ffeaa7",
        "#dfe6e9",
        "#fd79a8",
        "#a29bfe",
        "#6c5ce7",
        "#00b894",
    ];

    for (let i = 0; i < featureLines.length; i++) {
        const line = featureLines[i];

        if (!line.match(/^[ ]{4}[A-Z]/)) {
            continue;
        }

        const locationParts = [];
        let j = i;

        while (j < featureLines.length) {
            const nextLine = featureLines[j];
            if (nextLine.match(/^[ ]{4}[A-Z]/)) {
                break;
            }
            if (nextLine.match(/^\s*\//)) {
                j++;
                continue;
            }
            const locMatch = nextLine.trim();
            if (locMatch) {
                locationParts.push(locMatch);
            }
            j++;
        }

        const fullLocation = locationParts.join(" ");
        const nameMatch = fullLocation.match(/^([A-Z][A-Za-z_]*)\s+(.+)$/);
        if (!nameMatch) continue;

        const [, featureName, locations] = nameMatch;
        const currentAnnotations = annotations.length;

        const direction = locations.includes("complement(") ? -1 : 1;
        const annotation = {
            name: featureName.toUpperCase(),
            direction,
            color: featureColors[currentAnnotations % featureColors.length],
        };

        const rangeMatch = locations.match(/(\d+)\.\.(\d+)/);
        if (rangeMatch) {
            annotation.start = parseInt(rangeMatch[1], 10) - 1;
            annotation.end = parseInt(rangeMatch[2], 10);
            annotations.push(annotation);
        }
    }

    return annotations;
}

function detectFormat(metadata, content) {
    if (metadata.extension) {
        const ext = metadata.extension.toLowerCase();
        if (ext === "fasta" || ext === "fa" || ext === "faa" || ext === "dna" || ext === "rna" || ext === "protein")
            return "fasta";
        if (ext === "genbank" || ext === "gb" || ext === "gbk") return "genbank";
    }

    if (content.startsWith(">")) return "fasta";
    if (content.startsWith("LOCUS") || content.includes("//")) return "genbank";

    return "fasta";
}

async function initializeFromContent(root, datasetId) {
    try {
        const { metadata, content } = await fetchContent(root, datasetId);
        const format = detectFormat(metadata, content);
        console.debug(`[seqviz] Detected format: ${format}`);

        let seqData;
        try {
            if (format === "fasta") {
                seqData = parseFasta(content);
            } else if (format === "genbank") {
                seqData = parseGenbank(content);
            } else {
                throw new Error(`Unsupported format: ${format}`);
            }
        } catch (e) {
            console.error(`[seqviz] Parsing error:`, e.message);
            throw new Error(`Failed to parse ${metadata.extension || format}: ${e.message}`);
        }

        console.debug(`[seqviz] Parsed sequence:`, seqData.name, seqData.seq.length, "bp");

        const settings = getSettings();
        const viewerMode = settings.viewer || "both";
        const showAnnotations = settings.show_annotation_lines !== false;

        renderSeqViz(seqData, viewerMode, showAnnotations);
    } catch (e) {
        console.error(`[seqviz] Initialization error:`, e.message);
        showError(`Failed to load sequence: ${e.message}`);
    }
}

function initialize() {
    createUI();
    const datasetId = getDatasetId();
    const root = getRoot();
    console.debug(`[seqviz] Initializing with dataset_id: ${datasetId || "none"}, root: ${root || "none"}`);
    initializeFromContent(root, datasetId);
}

document.addEventListener("DOMContentLoaded", initialize);
