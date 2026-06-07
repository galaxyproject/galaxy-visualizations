import axios from "axios";
import { Viewer } from "seqviz";
import "./index.css";

const TEST_DATA = {
    fasta: {
        name: "pUC19",
        seq: "GTAZAAACCGTGGWGAATTTCATAATTCAATTTATACGTGTAGTGATCGATATTTCGATGCCATCATTACCTGTTGAAGATTTATTGGATCGCATATTTTGACCTACCACTTCGCCCAACAACTAACAGACCGTGATTTTCACCTTGACGTGTTTAAAGAGCAAAGTAGAACTCCTTACATTTATGATTTTATCGAAACGATGATGTTTCACTGTTAATAATTTTCGCTACCTCGTATTATCATTCCGAGATCCAGCGATTAACAACTATCAGGATCTAATTTCTATTTCGACTGTATTTCGCCAAGATGATCGGTATTATTGTCAAGCATTGGCATCGTCATCGATTTAACGGATCAAGGTTAGTTAATGAAATATATATAATGAATAAATATGGAATAAATTACATTTTACAATTTGTATAAATTAATAAG",
        annotations: [
            { start: 0, end: 26, name: "AmpR", direction: 1, color: "#ff6b6b" },
            { start: 28, end: 58, name: "LacZ", direction: 1, color: "#4ecdc4" },
        ],
    },
    genbank: {
        name: "pUC19",
        seq: "GTAZAAACCGTGGWGAATTTCATAATTCAATTTATACGTGTAGTGATCGATATTTCGATGCCATCATTACCTGTTGAAGATTTATTGGATCGCATATTTTGACCTACCACTTCGCCCAACAACTAACAGACCGTGATTTTCACCTTGACGTGTTTAAAGAGCAAAGTAGAACTCCTTACATTTATGATTTTATCGAAACGATGATGTTTCACTGTTAATAATTTTCGCTACCTCGTATTATCATTCCGAGATCCAGCGATTAACAACTATCAGGATCTAATTTCTATTTCGACTGTATTTCGCCAAGATGATCGGTATTATTGTCAAGCATTGGCATCGTCATCGATTTAACGGATCAAGGTTAGTTAATGAAATATATATAATGAATAAATATGGAATAAATTACATTTTACAATTTGTATAAATTAATAAG",
        annotations: [
            { start: 0, end: 26, name: "AmpR", direction: 1, color: "#ff6b6b" },
            { start: 28, end: 58, name: "LacZ", direction: 1, color: "#4ecdc4" },
        ],
    },
};

const MESSAGE_COLORS = {
    loading: "#3b82f6",
    error: "#ef4444",
    success: "#10b981",
};

const appElement = document.querySelector("#app");

if (import.meta.env.DEV) {
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: process.env.dataset_id || "__test__",
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

function showMessage(text, color = MESSAGE_COLORS.loading) {
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
    showMessage(`<strong>Error:</strong> ${text}`, MESSAGE_COLORS.error);
    console.error(`[seqvizviewer] ${text}`);
}

function showMessageSuccess(text) {
    showMessage(text, MESSAGE_COLORS.success);
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

async function fetchGalaxyDataset(root, datasetId) {
    showMessage("Loading sequence data from Galaxy...");

    try {
        const metaUrl = `${root}api/datasets/${datasetId}`;
        const displayUrl = `${root}api/datasets/${datasetId}/display`;

        console.log(`[seqvizviewer] Fetching metadata from: ${metaUrl}`);
        const { data: metadata } = await axios.get(metaUrl);
        console.log(`[seqvizviewer] Metadata received:`, metadata);

        console.log(`[seqvizviewer] Fetching content from: ${displayUrl}`);
        const { data: content } = await axios.get(displayUrl, { responseType: "text" });
        console.log(`[seqvizviewer] Content length: ${content.length}`);

        return { metadata, content };
    } catch (e) {
        console.error(`[seqvizviewer] Galaxy API error:`, e.message);
        throw e;
    }
}

function parseFasta(content) {
    const lines = content.split("\n").filter(line => line.trim() && !line.startsWith("//"));
    if (lines.length === 0) {
        throw new Error("Invalid FASTA format: empty content");
    }

    const name = lines[0].replace(/^>/, "").split(/\s+/)[0];
    const sequence = lines.slice(1).join("").toUpperCase();

    return { name, seq: sequence };
}

function parseGenbank(content) {
    console.log(`[seqvizviewer] Attempting to parse GenBank format`);
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
        console.error(`[seqvizviewer] Annotation parsing error:`, e.message);
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
        "#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7",
        "#dfe6e9", "#fd79a8", "#a29bfe", "#6c5ce7", "#00b894",
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
        if (ext === "fasta" || ext === "fa" || ext === "faa" || ext === "dna" || ext === "rna" || ext === "protein") return "fasta";
        if (ext === "genbank" || ext === "gb" || ext === "gbk") return "genbank";
    }

    if (content.startsWith(">")) return "fasta";
    if (content.startsWith("LOCUS") || content.includes("//")) return "genbank";

    return "fasta";
}

async function initializeFromGalaxy(root, datasetId) {
    try {
        const { metadata, content } = await fetchGalaxyDataset(root, datasetId);
        const format = detectFormat(metadata, content);
        console.log(`[seqvizviewer] Detected format: ${format}`);

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
            console.error(`[seqvizviewer] Parsing error:`, e.message);
            throw new Error(`Failed to parse ${metadata.extension || format}: ${e.message}`);
        }

        console.log(`[seqvizviewer] Parsed sequence:`, seqData.name, seqData.seq.length, "bp");

        const settings = getSettings();
        const viewerMode = settings.viewer || "both";
        const showAnnotations = settings.show_annotation_lines !== false;

        renderSeqViz(seqData, viewerMode, showAnnotations);
    } catch (e) {
        console.error(`[seqvizviewer] Initialization error:`, e.message);
        showError(`Failed to load sequence: ${e.message}`);
    }
}

function checkDirectUrl(datasetId) {
    if (datasetId && (datasetId.startsWith("http://") || datasetId.startsWith("https://"))) {
        return true;
    }
    return false;
}

async function resolveUrlToContent(url) {
    showMessage("Loading sequence from URL...");
    const displayUrl = `${url}`;

    try {
        const { data: content } = await axios.get(displayUrl, { responseType: "text" });
        const ext = url.match(/\.(\w+)(?:\?.*)?$/)?.[1]?.toLowerCase() || "";

        const format = detectFormat({ extension: ext }, content);

        let seqData;
        if (format === "fasta") {
            seqData = parseFasta(content);
        } else {
            seqData = parseGenbank(content);
        }

        return seqData;
    } catch (e) {
        throw new Error(`Failed to fetch sequence from URL: ${e.message}`);
    }
}

function initializeFromSample(sampleType) {
    try {
        const sample = TEST_DATA[sampleType] || TEST_DATA.fasta;
        const sampleName = sample.name || "Sample";
        const seqData = {
            name: sampleName,
            seq: sample.seq,
            annotations: sample.annotations || [],
        };

        const settings = getSettings();
        const viewerMode = settings.viewer || "both";
        const showAnnotations = settings.show_annotation_lines !== false;

        showMessageSuccess(`Sample sequence loaded (${sampleType} format)`);
        renderSeqViz(seqData, viewerMode, showAnnotations);
    } catch (e) {
        console.error(`[seqvizviewer] Sample load error:`, e.message);
        showError(`Failed to load sample: ${e.message}`);
    }
}

function initialize() {
    createUI();

    const datasetId = getDatasetId();
    const root = getRoot();
    const settings = getSettings();

    console.log(`[seqvizviewer] Initializing with dataset_id: ${datasetId || "none"}, root: ${root || "none"}`);

    if (checkDirectUrl(datasetId)) {
        resolveUrlToContent(datasetId)
            .then(seqData => {
                const viewerMode = settings.viewer || "both";
                const showAnnotations = settings.show_annotation_lines !== false;
                renderSeqViz(seqData, viewerMode, showAnnotations);
            })
            .catch(e => {
                console.error(`[seqvizviewer] Direct URL error:`, e.message);
                showError(`Failed to load sequence: ${e.message}`);
            });
    } else if (datasetId && datasetId !== "__test__" && datasetId !== "__sample__") {
        initializeFromGalaxy(root, datasetId);
    } else if (datasetId === "__sample__") {
        const sampleType = new URLSearchParams(window.location.search).get("format") || "fasta";
        initializeFromSample(sampleType);
    } else {
        const sampleType = new URLSearchParams(window.location.search).get("format") || "fasta";
        initializeFromSample(sampleType);
    }
}

document.addEventListener("DOMContentLoaded", initialize);

if (typeof window !== "undefined") {
    window.seqvizviewer = {
        initialize,
        createUI,
        renderSeqViz,
    };
}
