// The upstream JS, WASM and snippets are unmodified. This local shell avoids the
// public deployment's absolute asset paths, analytics and service worker.
const origin = location.origin;
function report(error) {
    window.parent.postMessage({ rustgis: "load-error", error }, origin);
}

let source;
addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== origin) return;
    if (event.data?.rustgis === "run" && event.data.command === "ui.addUrl") {
        source = event.data.params?.url;
    }
});

// Preserve RustGIS's responses/streaming; relay primary-source network failures
// because asynchronous ui.addUrl results only acknowledge that loading started.
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    try {
        const response = await fetchOriginal(input, init);
        if (url === source && !response.ok && response.status !== 416) {
            report(`Could not load the dataset (HTTP ${response.status}).`);
        }
        return response;
    } catch (error) {
        if (url === source) report("Could not reach the dataset. Check its URL, access permissions and CORS settings.");
        throw error;
    }
};

try {
    const response = await fetch(new URL("./build.json", import.meta.url));
    if (!response.ok) throw new Error(`Missing RustGIS build configuration (HTTP ${response.status}).`);
    const build = await response.json();
    const { default: init } = await import(new URL(build.module, import.meta.url).href);
    await init({ module_or_path: new URL(build.wasm, import.meta.url) });
} catch (error) {
    report(`RustGIS could not start: ${error.message}`);
    document.querySelector("#rustgis_loading").textContent =
        "RustGIS could not start. Check browser graphics and WebAssembly support.";
}
