import JSZip from "jszip";

const ZIP_URL = "/faith-pd-group-significance.qzv";
const BASE_PATH = "/59003edc-0779-4f0b-a379-a4bd58baa0bc/data"; // Only files under this path will be extracted

async function loadZipToMemory() {
    console.log("Loading ZIP content...");
    const response = await fetch(ZIP_URL);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const files = {};

    // Process files
    for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir || path.includes("__MACOSX/") || path.includes(".DS_Store") || path.startsWith("._")) {
            continue;
        }

        const normalizedPath = "/" + path.replace(/\\/g, "/").replace(/^\.\//, "");

        // Only process files under BASE_PATH
        if (normalizedPath.startsWith(BASE_PATH)) {
            // Map to root by removing BASE_PATH prefix
            const rootPath = normalizedPath.slice(BASE_PATH.length);
            const content = await file.async("uint8array");
            files[rootPath] = content;
        }
    }

    return files;
}

async function registerServiceWorker(files) {
    if (!navigator.serviceWorker) {
        throw new Error("Service workers not supported");
    }

    // Clear existing registrations
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));

    // Register with cache busting
    const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
    });

    // Wait for activation
    await new Promise((resolve) => {
        if (registration.active) return resolve();

        const listener = () => {
            registration.installing.addEventListener("statechange", (e) => {
                if (e.target.state === "activated") {
                    registration.removeEventListener("updatefound", listener);
                    resolve();
                }
            });
        };

        registration.addEventListener("updatefound", listener);
    });

    // Send files to service worker
    if (registration.active) {
        for (const [path, content] of Object.entries(files)) {
            registration.active.postMessage({
                type: "ADD_FILE",
                path,
                content,
            });
        }
    }

    return registration;
}

function mountWebsite(html) {
    document.getElementById("app").innerHTML = `
    <iframe srcdoc="${html.replace(/"/g, "&quot;")}"
            style="width:100%;height:100vh;border:none"></iframe>
  `;
}

async function initApp() {
    try {
        console.log("Loading ZIP to memory...");
        const files = await loadZipToMemory();
        console.log(files);
        // Verify we have an index.html
        if (!files["/index.html"]) {
            throw new Error("No index.html found in the specified BASE_PATH");
        }

        console.log("Registering service worker...");
        await registerServiceWorker(files);

        console.log("Mounting website...");
        mountWebsite(new TextDecoder().decode(files["/index.html"]));
    } catch (err) {
        console.error("Error:", err);
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
