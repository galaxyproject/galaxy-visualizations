import JSZip from "jszip";

// const ZIP_URL = "/raincloud-baseline0.qzv";
// const BASE_PATH = "/d0171103-9c4d-4bf9-924a-21a9065193b2/data";

const ZIP_URL = "/faith-pd-group-significance.qzv";
const BASE_PATH = "/59003edc-0779-4f0b-a379-a4bd58baa0bc/data";
const IGNORE = ["__MACOSX/", ".DS_Store"];
const SW_SCOPE = "/";

async function loadZipToMemory() {
    console.log("[GHOST] Loading ZIP content...");
    const response = await fetch(ZIP_URL);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const files = {};

    // Process files
    for (const [path, file] of Object.entries(zip.files)) {
        if (!file.dir && !IGNORE.some(pattern => path.includes(pattern))) {
            const normalizedPath = "/" + path.replace(/\\/g, "/").replace(/^\.\//, "");
            // Only process files under BASE_PATH
            if (normalizedPath.startsWith(BASE_PATH)) {
                // Map to root by removing BASE_PATH prefix
                const rootPath = normalizedPath.slice(BASE_PATH.length);
                const content = await file.async("uint8array");
                files[rootPath] = content;
            }
        }
    }

    return files;
}

async function registerServiceWorker(files) {
    if (navigator.serviceWorker) {
        // Clear existing registrations
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
        // Register with cache busting
        const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
            updateViaCache: "none",
        });
        // Send files to service worker
        if (registration.active) {
            for (const [path, content] of Object.entries(files)) {
                registration.active.postMessage({
                    type: "ADD",
                    path,
                    content,
                });
            }
        } else {
            throw new Error("[GHOST] Service activation failed.");
        }
        return registration;
    } else {
        throw new Error("[GHOST] Service workers not supported.");
    }
}

function mountWebsite(html) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.width = "100%";
    iframe.style.height = "100vh";
    iframe.style.border = "none";
    iframe.srcdoc = html.replace(/"/g, "&quot;");
    document.getElementById("app").innerHTML = "";
    document.getElementById("app").appendChild(iframe);
}

async function initApp() {
    try {
        console.log("[GHOST] Loading ZIP to memory...");
        const files = await loadZipToMemory();

        // Verify we have an index.html
        if (!files["/index.html"]) {
            throw new Error("No index.html found in the specified BASE_PATH");
        }

        console.log("[GHOST] Registering service worker...");
        await registerServiceWorker(files);

        console.log("[GHOST] Mounting website...");
        mountWebsite(new TextDecoder().decode(files["/index.html"]));
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
