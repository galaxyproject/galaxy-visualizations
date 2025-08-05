import JSZip from "jszip";

//const ZIP_URL = "https://raw.githubusercontent.com/qiime2/q2-fmt/master/demo/raincloud-baseline0.qzv";
//const BASE_PATH = "/d0171103-9c4d-4bf9-924a-21a9065193b2/data";

const ZIP_URL = "https://docs.qiime2.org/2024.2/data/tutorials/moving-pictures/core-metrics-results/faith-pd-group-significance.qzv";
const BASE_PATH = "/59003edc-0779-4f0b-a379-a4bd58baa0bc/data";

//const ZIP_URL = "https://raw.githubusercontent.com/caporaso-lab/q2view-visualizations/main/uu-fasttree-empire.qzv";
//const BASE_PATH = "/27c988f6-40aa-4066-b3ad-0ee98c8a5978/data";

const IGNORE = ["__MACOSX/", ".DS_Store"];
//const SCOPE = "/static/plugins/visualizations/ghost/static/";
const SCOPE = "/";

async function loadZipToMemory() {
    console.log("[GHOST] Loading ZIP content...");
    const response = await fetch(ZIP_URL);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const files = {};

    // Process files
    for (const [path, file] of Object.entries(zip.files)) {
        if (!file.dir && !IGNORE.some((pattern) => path.includes(pattern))) {
            const normalizedPath = "/" + path.replace(/\\/g, "/").replace(/^\.\//, "");

            // Only process files under BASE_PATH
            if (normalizedPath.startsWith(BASE_PATH)) {
                // Map to root by removing BASE_PATH prefix
                const rootPath = normalizedPath.slice(BASE_PATH.length);
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
            const registration = await navigator.serviceWorker.register(`${SCOPE}sw.js`, {
                scope: SCOPE,
                updateViaCache: "none",
            });
            // Send files to service worker
            if (registration.active) {
                registration.active.postMessage({
                    type: "SCOPE",
                    content: SCOPE,
                });
                for (const [path, content] of Object.entries(files)) {
                    registration.active.postMessage({
                        type: "ADD",
                        path,
                        content,
                    });
                }
            }
            return registration;
        } catch (e) {
            throw new Error("[GHOST] Service activation failed.", e);
        }
    } else {
        throw new Error("[GHOST] Service workers not supported.");
    }
}

function rebaseHtmlPaths(html) {
    return html.replace(/(src|href)=["']((?!https?:|data:|\/|#)[^"']+)["']/g, (match, attr, path) => {
        // Normalize "./" and strip it
        const normalizedPath = path.startsWith("./") ? path.slice(2) : path;
        return `${attr}="${SCOPE}${normalizedPath}"`;
    });
}

function mountWebsite(html) {
    const rebasedHtml = rebaseHtmlPaths(html);
    document.getElementById("app").innerHTML = `
        <iframe
            srcdoc="${rebasedHtml.replace(/"/g, "&quot;")}"
            style="width:100%;height:100vh;border:none">
        </iframe>
    `;
}

async function initApp() {
    try {
        console.log("[GHOST] Loading ZIP to memory...");
        const files = await loadZipToMemory();

        // Verify we have an index.html
        const indexFile = files[`${SCOPE}index.html`];
        if (!indexFile) {
            throw new Error("No index.html found in the specified BASE_PATH");
        }

        console.log("[GHOST] Registering service worker...");
        await registerServiceWorker(files);

        console.log("[GHOST] Mounting website...");
        mountWebsite(new TextDecoder().decode(indexFile));
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
