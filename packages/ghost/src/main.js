/*
GHOST is a Galaxy visualization that securely loads and displays static websites packaged
as ZIP-based QIIME 2 visualization (.qzv) files or similar archive formats. The archive is
fetched at runtime, unzipped in memory, and its contents are served to an embedded iframe
via a service worker. HTML files are automatically rebased so all relative paths resolve
through the service worker scope.

The service worker enforces a strict same-origin policy:
- Only GET requests within the defined virtual scope are served.
- Files are only returned if explicitly loaded into the in-memory virtual file system.
- Any other same-origin requests (for example, /api/version) are blocked with a 403
  Forbidden response to prevent malicious HTML content from interacting with the Galaxy API.

This enables arbitrary client-side visualizations to run isolated from the main Galaxy UI,
while still loading all assets locally from the extracted archive.

Some example archives you can load:
https://raw.githubusercontent.com/qiime2/q2-fmt/master/demo/raincloud-baseline0.qzv
https://docs.qiime2.org/2024.2/data/tutorials/moving-pictures/core-metrics-results/faith-pd-group-significance.qzv
https://raw.githubusercontent.com/caporaso-lab/q2view-visualizations/main/uu-fasttree-empire.qzv
*/

// Import styles
import "./main.css";

// Load JSZip to unzip files
import JSZip from "jszip";

// Access container element
const appElement = document.getElementById("app");

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

// Set index file name
const INDEX_NAME = "index.html";

// Set static path within GALAXY
const STATIC_PATH = "static/plugins/visualizations/ghost/static/";

// Set service worker script name
const SCRIPT_NAME = "ghost-worker.js";

// Locate service worker script
const SCRIPT_PATH = ROOT ? `${new URL(ROOT).pathname}${STATIC_PATH}` : "/";

// Determine scope
const SCOPE = `${SCRIPT_PATH}virtual/${DATASET_ID}/`;

// Determine dataset url
const ZIP = DATASET_ID ? `${ROOT}api/datasets/${DATASET_ID}/display` : incoming.visualization_config.dataset_url;

// Ignore list for zip loader
const IGNORE = ["__MACOSX/", ".DS_Store"];

// Add message container
const messageElement = document.createElement("div");
messageElement.id = "message";
messageElement.style.display = "none";
appElement.appendChild(messageElement);

// Unzip and write files to virtual file system
async function loadZipToMemory() {
    const response = await fetch(ZIP);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const files = {};

    // Detect index path from the index inside the zip
    const candidates = [];
    for (const [path, file] of Object.entries(zip.files)) {
        if (!file.dir) {
            const canon = "/" + path.replace(/\\/g, "/").replace(/^\.\//, "");
            if (canon.toLowerCase().endsWith(`/${INDEX_NAME}`)) {
                const dir = canon.slice(0, -(INDEX_NAME.length + 1));
                const depth = dir.split("/").filter(Boolean).length;
                candidates.push({ dir, depth, len: dir.length });
            }
        }
    }
    if (!candidates.length) {
        throw new Error(`No ${INDEX_NAME} found in ZIP`);
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

// Register service worker
async function registerServiceWorker(files) {
    if (navigator.serviceWorker) {
        try {
            let registration = await navigator.serviceWorker.getRegistration(SCOPE);
            if (!registration) {
                console.log("[GHOST] Creating service worker...");
                // Create service worker
                registration = await navigator.serviceWorker.register(`${SCRIPT_PATH}${SCRIPT_NAME}`, {
                    scope: SCOPE,
                    updateViaCache: "none",
                });

                // Wait for service to become active
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

                // Initialize and populate contents
                registration.active.postMessage({ type: "CREATE", scope: SCOPE, files: files });
            }

            // Return service worker handle
            return registration;
        } catch (e) {
            console.error(e);
            throw new Error("[GHOST] Service activation failed.", e);
        }
    } else {
        throw new Error("[GHOST] Service workers not supported.");
    }
}

// Show error message
function showMessage(title, details = null) {
    details = details ? `: ${details}` : "";
    messageElement.innerHTML = `<strong>${title}${details}</strong>`;
    messageElement.style.display = "inline";
    console.debug(`${title}${details}`);
}

// Mount website
function showWebsite() {
    const iframe = document.createElement("iframe");
    iframe.style.width = "100%";
    iframe.style.height = "100vh";
    iframe.style.border = "none";
    iframe.src = `${SCOPE}${INDEX_NAME}`;
    document.getElementById("app").innerHTML = "";
    document.getElementById("app").appendChild(iframe);
}

// Render content
async function startApp() {
    try {
        console.log("[GHOST] Loading ZIP content from", ZIP);
        const files = await loadZipToMemory();
        console.log("[GHOST] Registering service worker...");
        await registerServiceWorker(files);
        console.log("[GHOST] Mounting website...");
        showWebsite();
    } catch (err) {
        console.error("[GHOST] Error:", err);
        showMessage("Loading Error", err.message);
    }
}

// Destroy service worker
async function stopApp(registration) {
    try {
        if (registration && registration.active) {
            registration.active.postMessage({ type: "DESTROY" });
        }
        if (registration) {
            await registration.unregister();
            console.log("[GHOST] Successfully, unregistered");
        }
    } catch (e) {
        console.error("[GHOST] Teardown error:", e);
    }
}

// Start the app
startApp();
