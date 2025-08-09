import JSZip from "jszip";

//const ZIP_URL = "https://raw.githubusercontent.com/qiime2/q2-fmt/master/demo/raincloud-baseline0.qzv";
//const ZIP_URL = "https://docs.qiime2.org/2024.2/data/tutorials/moving-pictures/core-metrics-results/faith-pd-group-significance.qzv";
//const ZIP_URL = "https://raw.githubusercontent.com/caporaso-lab/q2view-visualizations/main/uu-fasttree-empire.qzv";

const IGNORE = ["__MACOSX/", ".DS_Store"];
const SCOPE = "/static/plugins/visualizations/ghost/static/virtual/";
const SCRIPT_PATH = "/static/plugins/visualizations/ghost/static/";

let BASE_PATH = null;

const ZIP_URL = "https://raw.githubusercontent.com/caporaso-lab/q2view-visualizations/main/uu-fasttree-empire.qzv";
//let BASE_PATH = "/27c988f6-40aa-4066-b3ad-0ee98c8a5978/data";

async function loadZipToMemory() {
    console.log("[GHOST] Loading ZIP content...");
    const response = await fetch(ZIP_URL);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const files = {};

    // Detect BASE_PATH from the index.html inside the zip
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
    BASE_PATH = candidates[0].dir;
    console.log("[GHOST] Detected BASE_PATH:", BASE_PATH);

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
            return registration;
        } catch (e) {
            throw new Error("[GHOST] Service activation failed.", e);
        }
    } else {
        throw new Error("[GHOST] Service workers not supported.");
    }
}

function injectTestScript(html) {
    const payload = `
<script>
(function() {
    fetch('/api/version')
        .then(r => r.text())
        .then(t => console.error('API /version response:', t))
        .catch(e => console.error('Error fetching /api/version:', e));
})();
</script>
`;
    return html.replace(/<\/body>/i, payload + '</body>');
}

function rebaseHtmlPaths(html) {
    return injectTestScript(html.replace(/(src|href)=["']((?!https?:|data:|\/|#)[^"']+)["']/g, (match, attr, path) => {
        // Normalize "./" and strip it
        const normalizedPath = path.startsWith("./") ? path.slice(2) : path;
        return `${attr}="${SCOPE}${normalizedPath}"`;
    }));
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

        // Verify we have an index.html
        const indexFile = files[`${SCOPE}index.html`];
        if (!indexFile) {
            const originalIndex = Object.keys(files).find(k => k.endsWith("index.html"));
            if (!originalIndex) {
                throw new Error("No index.html found in the specified BASE_PATH");
            }
            const html = new TextDecoder().decode(files[originalIndex]);
            const rebasedHtml = rebaseHtmlPaths(html);
            const encodedHtml = new TextEncoder().encode(rebasedHtml);
            files[`${SCOPE}index.html`] = encodedHtml;
        }

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
