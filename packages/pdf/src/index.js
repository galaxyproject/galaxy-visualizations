import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import "./index.css";

const TEST_DATA_FILE = "test-data/1.pdf";
const ZOOM_STEP = 1.25;
const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const PAGE_MARGIN = 32;
const MAX_AUTO_SCALE = 1.25;

GlobalWorkerOptions.workerSrc = workerUrl;

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
  <div id="pdf-error"></div>
  <div id="pdf-toolbar">
    <span id="pdf-page"></span>
    <button id="pdf-zoom-out" title="Zoom out">−</button>
    <span id="pdf-zoom"></span>
    <button id="pdf-zoom-in" title="Zoom in">+</button>
    <button id="pdf-fit" title="Fit to width">Fit width</button>
  </div>
  <div id="pdf-status">Loading dataset…</div>
  <div id="pdf-pages"></div>
`;

const errorElement = document.getElementById("pdf-error");
const statusElement = document.getElementById("pdf-status");
const pagesElement = document.getElementById("pdf-pages");
const pageElement = document.getElementById("pdf-page");
const zoomElement = document.getElementById("pdf-zoom");

let pdf = null;
let pages = [];
let scale = 1;
let fit = "auto";

function showError(message) {
    errorElement.textContent = message;
    errorElement.style.display = "block";
    setStatus("");
}

function setStatus(message) {
    statusElement.textContent = message;
    statusElement.style.display = message ? "block" : "none";
}

function widthScale() {
    const widest = Math.max(...pages.map(({ viewport }) => viewport.width));
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, (pagesElement.clientWidth - PAGE_MARGIN) / widest));
}

const visible = new IntersectionObserver(
    (entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                renderPage(pages[Number(entry.target.dataset.page) - 1]);
            }
        }
        updatePageNumber();
    },
    { root: pagesElement, rootMargin: "100% 0px" },
);

async function renderPage(page) {
    if (page.renderedScale === scale) {
        return;
    }
    page.renderedScale = scale;
    page.task?.cancel();
    const viewport = page.viewport.clone({ scale });
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    page.task = page.proxy.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    try {
        await page.task.promise;
        page.element.replaceChildren(canvas);
        page.element.classList.add("pdf-rendered");
    } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
            showError(`Could not draw page ${page.number}: ${err.message}`);
        }
    }
}

function layout() {
    if (fit) {
        scale = fit === "auto" ? Math.min(widthScale(), MAX_AUTO_SCALE) : widthScale();
    }
    for (const page of pages) {
        page.element.style.width = `${page.viewport.width * scale}px`;
        page.element.style.height = `${page.viewport.height * scale}px`;
        page.renderedScale = null;
    }
    zoomElement.textContent = `${Math.round(scale * 100)}%`;
    for (const page of pages) {
        visible.unobserve(page.element);
        visible.observe(page.element);
    }
}

function zoomTo(next) {
    const anchor = pagesElement.scrollTop / pagesElement.scrollHeight;
    fit = null;
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    layout();
    pagesElement.scrollTop = anchor * pagesElement.scrollHeight;
}

function updatePageNumber() {
    const middle = pagesElement.scrollTop + pagesElement.clientHeight / 2;
    const current = pages.find(({ element }) => element.offsetTop + element.offsetHeight >= middle) || pages.at(-1);
    pageElement.textContent = current ? `Page ${current.number} / ${pages.length}` : "";
}

document.getElementById("pdf-zoom-in").addEventListener("click", () => zoomTo(scale * ZOOM_STEP));
document.getElementById("pdf-zoom-out").addEventListener("click", () => zoomTo(scale / ZOOM_STEP));
document.getElementById("pdf-fit").addEventListener("click", () => {
    fit = "width";
    layout();
});
pagesElement.addEventListener("scroll", updatePageNumber);

new ResizeObserver(() => {
    if (pages.length && fit) {
        layout();
    }
}).observe(pagesElement);

async function init() {
    if (!datasetId) {
        showError("No dataset_id provided by Galaxy.");
        return;
    }
    let data;
    try {
        const url = datasetId === "__test__" ? TEST_DATA_FILE : `${root}api/datasets/${datasetId}/display`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        data = new Uint8Array(await response.arrayBuffer());
    } catch (err) {
        showError(`Could not fetch dataset: ${err.message}`);
        return;
    }
    try {
        pdf = await getDocument({ data }).promise;
        for (let number = 1; number <= pdf.numPages; number++) {
            const proxy = await pdf.getPage(number);
            const element = document.createElement("div");
            element.className = "pdf-page";
            element.dataset.page = String(number);
            pagesElement.appendChild(element);
            pages.push({ number, proxy, element, viewport: proxy.getViewport({ scale: 1 }) });
        }
    } catch (err) {
        showError(`Could not open PDF: ${err.message}`);
        return;
    }
    setStatus("");
    layout();
    updatePageNumber();
}

init();
