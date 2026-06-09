import axios from "axios";
import { createJSONEditor } from "vanilla-jsoneditor";
import * as yaml from "js-yaml";
import * as jsonld from "jsonld";
import "./main.css";

const TEST_URLS = {
    json: "http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.json",
    yaml: "http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.yaml",
    jsonld: "http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.jsonld",
};

const SAMPLE_JSON = {
    name: "Galaxy Workflow",
    version: "1.0",
    steps: [
        { id: 1, tool: "bwa_mem", input: "reads.fastq", output: "aligned.bam" },
        { id: 2, tool: "samtools_sort", input: "aligned.bam", output: "sorted.bam" },
        { id: 3, tool: "macs2_callpeak", input: "sorted.bam", output: "peaks.bed" },
    ],
    annotation: "Example ChIP-seq analysis pipeline",
};

const SAMPLE_YAML = `
workflow: RNA-seq Differential Expression
version: "2.0"
inputs:
  - name: fastq_r1
    type: fastq
    description: Read 1
  - name: fastq_r2
    type: fastq
    description: Read 2
steps:
  - tool: fastp
    inputs: [fastq_r1, fastq_r2]
    outputs: [trimmed_r1, trimmed_r2]
  - tool: hisat2
    inputs: [trimmed_r1, trimmed_r2]
    outputs: [aligned_bam]
  - tool: featurecounts
    inputs: [aligned_bam]
    outputs: [counts]
  - tool: deseq2
    inputs: [counts]
    outputs: [results]
`;

const SAMPLE_JSONLD = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Gene Expression Matrix",
    description: "RNA-seq gene expression counts from 12 samples",
    creator: {
        "@type": "Person",
        name: "Jane Doe",
    },
    distribution: {
        "@type": "DataDownload",
        encodingFormat: "text/tab-separated-values",
        contentUrl: "https://example.org/data/expr_matrix.tsv",
    },
};

const appElement = document.querySelector("#app");

if (import.meta.env.DEV) {
    const devDatasetId = process.env.dataset_id || "__sample__";
    const dataIncoming = {
        root: "/",
        visualization_config: {
            dataset_id: devDatasetId,
        },
    };
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

const incoming = JSON.parse(appElement?.getAttribute("data-incoming") || "{}");
const datasetId = incoming.visualization_config.dataset_id;
const root = incoming.root;
const settings = incoming.visualization_config.settings || {};
const mode = settings.mode || "tree";
const expandJsonld = settings.expand_jsonld === true || settings.expand_jsonld === "true";

const isTestMode = datasetId === "__test__";
const isSampleMode = !datasetId || datasetId === "__sample__";
const isDirectUrl = datasetId && datasetId.startsWith("http");
const testFormat = new URLSearchParams(window.location.search).get("format") || "json";

const messageElement = document.createElement("div");
messageElement.id = "message";
appElement.appendChild(messageElement);

const editorElement = document.createElement("div");
editorElement.id = "jsoneditor";
appElement.appendChild(editorElement);

function isDarkTheme() {
    if (document.documentElement.getAttribute("data-theme") === "dark") return true;
    if (document.body.classList.contains("theme-dark")) return true;
    const style = getComputedStyle(document.documentElement);
    return style.getPropertyValue("--galaxy-theme")?.trim() === "dark";
}

function detectFormatFromUrl(url) {
    if (url.endsWith(".yaml") || url.endsWith(".yml")) return "yaml";
    if (url.endsWith(".jsonld")) return "jsonld";
    return "json";
}

function detectFormatFromContent(content) {
    try {
        JSON.parse(content);
        return "json";
    } catch {
        try {
            yaml.load(content);
            return "yaml";
        } catch {
            return "text";
        }
    }
}

function parseYaml(content) {
    return yaml.load(content);
}

async function expandJsonLd(data) {
    try {
        return await jsonld.expand(data);
    } catch (e) {
        showError("Failed to expand JSON-LD", e);
        return data;
    }
}

function getEditorMode(modeSetting) {
    if (modeSetting === "text") return "text";
    if (modeSetting === "table") return "table";
    return "tree";
}

function renderEditor(jsonData, parserConfig) {
    if (isDarkTheme()) {
        editorElement.classList.add("jse-theme-dark");
    }

    createJSONEditor({
        target: editorElement,
        props: {
            content: { json: jsonData },
            mode: getEditorMode(mode),
            mainMenuBar: true,
            readOnly: true,
            ...parserConfig,
        },
    });

    hideMessage();
}

function renderSamplePicker() {
    const container = document.createElement("div");
    container.id = "sample-picker";

    const label = document.createElement("div");
    label.id = "sample-label";
    label.textContent = "No Galaxy connection detected. Choose sample data to preview:";
    container.appendChild(label);

    const formats = [
        { name: "JSON", format: "json", data: SAMPLE_JSON },
        { name: "YAML", format: "yaml", data: SAMPLE_YAML },
        { name: "JSON-LD", format: "jsonld", data: SAMPLE_JSONLD },
    ];

    formats.forEach(({ name, format, data }) => {
        const btn = document.createElement("button");
        btn.className = "sample-btn";
        btn.textContent = name;
        btn.onclick = () => loadInlineData(format, data);
        container.appendChild(btn);
    });

    appElement.insertBefore(container, editorElement);
    hideMessage();
}

function loadInlineData(format, data) {
    const picker = document.getElementById("sample-picker");
    if (picker) picker.remove();

    let jsonData;
    let parserConfig = {};
    let content;

    if (format === "yaml") {
        content = typeof data === "string" ? data : yaml.dump(data, { lineWidth: -1 });
        jsonData = parseYaml(content);
        parserConfig = {
            parser: {
                parse: (text) => yaml.load(text),
                stringify: (value) => yaml.dump(value, { lineWidth: -1 }),
            },
        };
    } else if (format === "jsonld") {
        jsonData = typeof data === "string" ? JSON.parse(data) : data;
        if (expandJsonld) {
            expandJsonLd(jsonData).then((expanded) => renderEditor(expanded, parserConfig));
            return;
        }
    } else {
        jsonData = typeof data === "string" ? JSON.parse(data) : data;
    }

    renderEditor(jsonData, parserConfig);
}

async function loadFromUrl(url, format) {
    showMessage("Loading...");
    try {
        const { data: content } = await axios.get(url, { responseType: "text" });
        if (!format) {
            format = detectFormatFromUrl(url) || detectFormatFromContent(content);
        }

        let jsonData;
        let parserConfig = {};

        if (format === "yaml") {
            jsonData = parseYaml(content);
            parserConfig = {
                parser: {
                    parse: (text) => yaml.load(text),
                    stringify: (value) => yaml.dump(value, { lineWidth: -1 }),
                },
            };
        } else if (format === "jsonld") {
            jsonData = JSON.parse(content);
            if (expandJsonld) {
                jsonData = await expandJsonLd(jsonData);
            }
        } else if (format === "json") {
            jsonData = JSON.parse(content);
        } else {
            jsonData = { text: content };
        }

        renderEditor(jsonData, parserConfig);
    } catch (e) {
        showError("Failed to load dataset", e);
    }
}

async function loadFromGalaxy() {
    showMessage("Loading...");
    try {
        const metaUrl = `${root}api/datasets/${datasetId}`;
        const contentUrl = `${root}api/datasets/${datasetId}/display`;

        const { data: metadata } = await axios.get(metaUrl);
        const { data: content } = await axios.get(contentUrl, { responseType: "text" });

        const ext = metadata.extension || metadata.data_type || "";
        let format;
        if (ext === "yaml" || ext === "yml") format = "yaml";
        else if (ext === "jsonld") format = "jsonld";
        else if (ext === "json") format = "json";
        else format = detectFormatFromContent(content);

        let jsonData;
        let parserConfig = {};

        if (format === "yaml") {
            jsonData = parseYaml(content);
            parserConfig = {
                parser: {
                    parse: (text) => yaml.load(text),
                    stringify: (value) => yaml.dump(value, { lineWidth: -1 }),
                },
            };
        } else if (format === "jsonld") {
            jsonData = JSON.parse(content);
            if (expandJsonld) {
                jsonData = await expandJsonLd(jsonData);
            }
        } else if (format === "json") {
            jsonData = JSON.parse(content);
        } else {
            jsonData = { text: content };
        }

        renderEditor(jsonData, parserConfig);
    } catch (e) {
        showError("Failed to load dataset", e);
    }
}

function showMessage(title) {
    messageElement.innerHTML = `<strong>${title}</strong>`;
    messageElement.style.display = "inline";
}

function showError(title, err) {
    messageElement.innerHTML = `<strong>${title}</strong>: ${err}`;
    messageElement.style.display = "inline";
    console.error(`${title}: ${err}`);
}

function hideMessage() {
    messageElement.style.display = "none";
}

if (isSampleMode) {
    renderSamplePicker();
} else if (isTestMode) {
    loadFromUrl(TEST_URLS[testFormat] || TEST_URLS.json, testFormat);
} else if (isDirectUrl) {
    loadFromUrl(datasetId);
} else {
    loadFromGalaxy();
}
