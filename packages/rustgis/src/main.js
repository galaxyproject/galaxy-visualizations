import { datasetSource, galaxyRoot } from "./dataset.js";
import "./style.css";

const app = document.querySelector("#app");
const status = document.createElement("div");
status.className = "status";
status.setAttribute("role", "status");
const heading = document.createElement("span");
heading.className = "dataset-name";
const note = document.createElement("span");
note.className = "note";
const toolbar = document.createElement("header");
toolbar.append(heading, note);
app.append(toolbar, status);
let timer;
let failed = false;

// Shows the error; a late start or import still clears one from a timeout.
function error(message, final = true) {
    clearTimeout(timer);
    failed = failed || final;
    app.dataset.state = "error";
    status.hidden = false;
    status.setAttribute("role", "alert");
    status.textContent = message;
}

async function main() {
    const incoming = JSON.parse(app.getAttribute("data-incoming") || "{}");
    const id = incoming.visualization_config?.dataset_id;
    if (!id) throw new Error("No Galaxy dataset was provided.");
    const root = galaxyRoot(incoming.root);
    let source;
    if (id === "__demo__") {
        const path = import.meta.env.DEV ? "../test-data/berlin.geojson" : "./test-data/berlin.geojson";
        source = {
            url: new URL(/* @vite-ignore */ path, import.meta.url).href,
            name: "Berlin landmarks",
            extension: "geojson",
        };
    } else {
        status.textContent = "Reading dataset information…";
        const response = await fetch(new URL(`api/datasets/${encodeURIComponent(id)}`, root), {
            credentials: "same-origin",
        });
        if (!response.ok) throw new Error(`Could not access the dataset (HTTP ${response.status}).`);
        source = datasetSource(await response.json(), root, id);
    }
    heading.textContent = `RustGIS · ${source.name}`;
    if (["las", "laz"].includes(source.extension)) {
        note.textContent = "LiDAR: up to 500,000 sampled points; files download in full (256 MiB maximum).";
    } else if (source.deferred) {
        note.textContent = "Loading directly from the deferred dataset's source.";
    }

    const relative = import.meta.env.DEV ? "../vendor/rustgis/index.html" : "./vendor/rustgis/index.html";
    const viewerUrl = new URL(/* @vite-ignore */ relative, import.meta.url);
    // Upstream recognizes bare flags; URLSearchParams would turn this into
    // `embed=`, which starts the ordinary app without its message bridge.
    const flags = ["embed"];
    // WebGPU where available, WebGL2 on browsers without it. The local demo can
    // force WebGL2 for graphics troubleshooting without changing saved config.
    if (new URLSearchParams(window.location.search).has("webgl")) flags.push("webgl");
    viewerUrl.search = flags.join("&");
    const frame = document.createElement("iframe");
    frame.id = "rustgis-viewer";
    frame.title = "RustGIS geographic data viewer";
    frame.allow = "fullscreen";
    status.textContent = "Starting RustGIS…";
    app.dataset.state = "starting";
    timer = setTimeout(
        () => error("RustGIS did not start. Check browser graphics and WebAssembly support, then reload.", false),
        120_000,
    );
    let ready = false;
    const onMessage = (event) => {
        if (event.source !== frame.contentWindow || event.origin !== viewerUrl.origin || failed) return;
        const message = event.data;
        if (message?.rustgis === "load-error") {
            error(typeof message.error === "string" ? message.error : "RustGIS could not load the dataset.");
        } else if (message?.rustgis === "ready" && !ready) {
            ready = true;
            clearTimeout(timer);
            app.dataset.state = "loading";
            status.setAttribute("role", "status");
            status.textContent = `Opening ${source.name}…`;
            timer = setTimeout(
                () =>
                    error(
                        "The dataset did not open. Check the notices inside RustGIS for format, size or access errors.",
                        false,
                    ),
                120_000,
            );
            frame.contentWindow.postMessage(
                {
                    rustgis: "run",
                    id: "galaxy-load",
                    command: "ui.addUrl",
                    params: { url: source.url, name: source.name, zoom: true },
                },
                viewerUrl.origin,
            );
        } else if (message?.rustgis === "result" && message.id === "galaxy-load" && !message.ok) {
            error(message.error || "RustGIS could not open the dataset.");
        } else if (message?.rustgis === "project" && ready) {
            try {
                const project = JSON.parse(message.text);
                // A project message confirms actual import, not merely queued work.
                const inMap = project.maps?.some((map) =>
                    [...(map.layers || []), ...(map.tiles || [])].some((layer) => layer.name === source.name),
                );
                const inTable = project.tables?.some((table) => table.name === source.name);
                if (inMap || inTable) {
                    clearTimeout(timer);
                    app.dataset.state = "loaded";
                    status.setAttribute("role", "status");
                    status.hidden = true;
                }
            } catch {
                error("RustGIS returned an invalid project.");
            }
        }
    };
    window.addEventListener("message", onMessage);
    window.addEventListener(
        "pagehide",
        () => {
            clearTimeout(timer);
            window.removeEventListener("message", onMessage);
        },
        { once: true },
    );
    frame.src = viewerUrl.href;
    app.append(frame);
}

main().catch((failure) => error(failure.message));
