import JSZip from "jszip";

const ZIP_URL = "/data.zip";

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
        const content = await file.async("uint8array");
        files[normalizedPath] = content;
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
