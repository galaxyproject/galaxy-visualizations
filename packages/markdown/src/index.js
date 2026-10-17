import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import "./index.css";

const TEST_DATA_FILE = "test-data/1.md";

const appElement = document.getElementById("app");

if (import.meta.env.DEV) {
    const pageUrl = new URL(window.location.href);
    appElement.dataset.incoming = JSON.stringify({
        root: "/",
        visualization_config: {
            dataset_id: pageUrl.searchParams.get("dataset_id") || process.env.dataset_id || "__test__",
        },
    });
}

const incoming = JSON.parse(appElement.dataset.incoming || "{}");
const root = incoming.root || "/";
const datasetId = incoming.visualization_config?.dataset_id;

appElement.innerHTML = `
  <div id="markdown-error" role="alert"></div>
  <div id="markdown-truncated" role="note"></div>
  <div id="markdown-status" role="status" aria-live="polite">Loading dataset…</div>
  <main id="markdown-content" class="markdown-body" aria-busy="true"></main>
`;

const errorElement = document.getElementById("markdown-error");
const truncatedElement = document.getElementById("markdown-truncated");
const statusElement = document.getElementById("markdown-status");
const contentElement = document.getElementById("markdown-content");

// Raw HTML stays off: the plugin runs in a same-origin iframe, so dataset content must never become markup.
const markdown = new MarkdownIt({ html: false, linkify: true });

// Links leave the iframe instead of replacing the visualization; in-page anchors stay put.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.hasAttribute("href") && !node.getAttribute("href").startsWith("#")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
    }
    // Remote images must not leak the Referer and should not load until scrolled into view.
    if (node.tagName === "IMG") {
        node.setAttribute("referrerpolicy", "no-referrer");
        node.setAttribute("loading", "lazy");
    }
});

function showError(message) {
    errorElement.textContent = message;
    errorElement.style.display = "block";
    setStatus("");
}

function setStatus(message) {
    statusElement.textContent = message;
    statusElement.style.display = message ? "block" : "none";
}

function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "";
    }
    return bytes >= 1e6 ? ` ${(bytes / 1e6).toFixed(1)} MB` : ` ${Math.round(bytes / 1e3)} KB`;
}

function render(text) {
    const html = DOMPurify.sanitize(markdown.render(text), { USE_PROFILES: { html: true } });
    contentElement.innerHTML = html;
    if (!contentElement.textContent.trim() && !contentElement.querySelector("img")) {
        contentElement.innerHTML = "";
        setStatus("This dataset is empty.");
    } else {
        setStatus("");
    }
}

async function init() {
    if (!datasetId) {
        showError("No dataset_id provided by Galaxy.");
        return;
    }
    let text;
    try {
        const url =
            datasetId === "__test__"
                ? TEST_DATA_FILE
                : `${root}api/datasets/${encodeURIComponent(datasetId)}/display?preview=true`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
        }
        text = await response.text();
        const truncated = response.headers.get("x-content-truncated");
        if (truncated) {
            truncatedElement.textContent = `This dataset is large, so only the first${formatBytes(truncated)} are shown.`;
            truncatedElement.style.display = "block";
        }
    } catch (err) {
        showError(`Could not fetch dataset: ${err.message}`);
        return;
    } finally {
        contentElement.removeAttribute("aria-busy");
    }
    try {
        render(text);
    } catch (err) {
        showError(`Could not render Markdown: ${err.message}`);
    }
}

init();
