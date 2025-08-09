import JSZip from "jszip";

// Access container element
const appElement = document.getElementById("app");

//const ZIP_URL = "https://raw.githubusercontent.com/qiime2/q2-fmt/master/demo/raincloud-baseline0.qzv";
//const ZIP_URL = "https://docs.qiime2.org/2024.2/data/tutorials/moving-pictures/core-metrics-results/faith-pd-group-significance.qzv";
//const ZIP_URL = "https://raw.githubusercontent.com/caporaso-lab/q2view-visualizations/main/uu-fasttree-empire.qzv";

// Attach mock data for development
if (import.meta.env.DEV) {
    // Build the incoming data object
    const dataIncoming = {
        visualization_config: {
            dataset_url:
                "https://raw.githubusercontent.com/caporaso-lab/q2view-visualizations/main/uu-fasttree-empire.qzv",
        },
    };

    // Attach config to the data-incoming attribute
    appElement?.setAttribute("data-incoming", JSON.stringify(dataIncoming));
}

// Access attached data
const incoming = JSON.parse(appElement?.dataset.incoming || "{}");

// Collect dataset identifier
const DATASET_ID = incoming.visualization_config.dataset_id;

// Collect root
const ROOT = incoming.root;

// Set static path within GALAXY
const STATIC_PATH = "static/plugins/visualizations/ghost/static/";

// Locate service worker script
const SCRIPT_PATH = ROOT ? `${new URL(ROOT).pathname}${STATIC_PATH}` : "/";

// Determine scope
const SCOPE = `${SCRIPT_PATH}virtual/`;

// Determine dataset url
const URL = DATASET_ID ? `${ROOT}api/datasets/${DATASET_ID}/display` : incoming.visualization_config.dataset_url;

// Ignore list for zip loader
const IGNORE = ["__MACOSX/", ".DS_Store"];

async function loadZipToMemory() {
    console.log("[GHOST] Loading ZIP content from", URL);
    const response = await fetch(URL);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const files = {};

    // Detect index path from the index.html inside the zip
    const candidates = [];
    for (const [path, file] of Object.entries(zip.files)) {
        if (!file.dir) {
            const canon = "/" + path.replace(/\\/g, "/").replace(/^\.\//, "");
            if (canon.toLowerCase().endsWith("/index.html")) {
                const dir = canon.slice(0, -"/index.html".length);
                const depth = dir.split("/").filter(Boolean).length;
                candidates.push({ dir, depth, len: dir.length });
            }
        }
    }
    if (!candidates.length) {
        throw new Error("No index.html found in ZIP");
    }
    candidates.sort((a, b) => a.depth - b.depth || a.len - b.len);
    const indexPath = candidates[0].dir;
    console.log("[GHOST] Detected index path:", indexPath);

    // Process files
    for (const [path, file] of Object.entries(zip.files)) {
        if (!file.dir && !IGNORE.some((pattern) => path.includes(pattern))) {
            const normalizedPath = "/" + path.replace(/\\/g, "/").replace(/^\.\//, "");
            // Only process files under index path
            if (normalizedPath.startsWith(indexPath)) {
                // Map to root by removing index prefix
                const rootPath = normalizedPath.slice(indexPath.length);
                const content = await file.async("uint8array");
                files[SCOPE + rootPath.slice(1)] = content;
            }
        }
    }
    console.log("[GHOST] Registered files:", Object.keys(files).length);
    return files;
}

async function registerServiceWorker(files) {
    if (navigator.serviceWorker) {
        // Clear existing registrations
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
        // Register with cache busting
        try {
            const registration = await navigator.serviceWorker.register(`${SCRIPT_PATH}sw.js`, {
                scope: SCOPE,
                updateViaCache: "none",
            });
            // Wait until the service worker is active
            if (!registration.active) {
                await new Promise((resolve) => {
                    const sw = registration.installing || registration.waiting;
                    if (sw) {
                        sw.addEventListener("statechange", function onStateChange(e) {
                            if (e.target.state === "activated") {
                                sw.removeEventListener("statechange", onStateChange);
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                });
            }
            // Send files to service worker
            registration.active.postMessage({
                type: "CONFIGURE",
                scope: SCOPE,
            });
            for (const [path, content] of Object.entries(files)) {
                registration.active.postMessage({
                    type: "ADD",
                    path,
                    content,
                });
            }
            return registration;
        } catch (e) {
            throw new Error("[GHOST] Service activation failed.", e);
        }
    } else {
        throw new Error("[GHOST] Service workers not supported.");
    }
}

function buildTestHtml(title = "Probe") {
    const s = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><h1>${title}</h1><pre id="out"></pre><script>(function(){function w(m){try{const o=document.getElementById("out");if(o){o.textContent+=m+"\\n";}}catch(e){console.log(e);}console.log(m);}try{w("[PROBE] start");fetch("/api/version",{credentials:"include"}).then(function(r){return r.text();}).then(function(t){w("[PROBE] /api/version: "+t);}).catch(function(e){w("[PROBE] error: "+e);});}catch(e){w("[PROBE] threw: "+e);}})();</script></body></html>`;
    return s;
}

function mountWebsite() {
    const iframe = document.createElement("iframe");
    iframe.style.width = "100%";
    iframe.style.height = "100vh";
    iframe.style.border = "none";
    iframe.src = `${SCOPE}index.html`;
    document.getElementById("app").innerHTML = "";
    document.getElementById("app").appendChild(iframe);
}

async function initApp() {
    try {
        console.log("[GHOST] Loading ZIP to memory...");
        const files = await loadZipToMemory();
        console.log("[GHOST] Registering service worker...");
        await registerServiceWorker(files);
        console.log("[GHOST] Mounting website...");
        mountWebsite();
    } catch (err) {
        console.error("[GHOST] Error:", err);
        document.getElementById("app").innerHTML = `
      <div style="color:red;padding:1rem">
        <h2>Loading Error</h2>
        <p>${err.message}</p>
        <button onclick="window.location.reload()">Reload</button>
      </div>
    `;
    }
}

// Start the app
initApp();
