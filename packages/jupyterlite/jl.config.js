const AI_SETTINGS = "@jupyterlite/ai:settings-model";
const PYODIDE_KERNEL = "@jupyterlite/pyodide-kernel-extension:kernel";
const searchParams = Object.fromEntries(new URL(window.location.href).searchParams.entries());
const galaxyApiBase = searchParams.root + "api/plugins/jupyterlite";

// Intercept fetch to strip Authorization header for Galaxy API requests
const originalFetch = window.fetch;
const galaxyApiPath = galaxyApiBase.startsWith("http") ? new URL(galaxyApiBase).pathname : galaxyApiBase;
window.fetch = async function (url, init) {
    // Normalize URL to pathname for comparison
    let pathname;
    if (typeof url === "string") {
        pathname = url.startsWith("http") ? new URL(url).pathname : url;
    } else if (url instanceof URL) {
        pathname = url.pathname;
    } else if (url instanceof Request) {
        pathname = new URL(url.url).pathname;
    } else {
        pathname = String(url);
    }

    // Check if this is a Galaxy API request
    if (pathname.startsWith(galaxyApiPath)) {
        // Handle Request objects with built-in headers
        if (url instanceof Request) {
            const headers = new Headers(url.headers);
            headers.delete("Authorization");
            url = new Request(url, { headers });
        }
        // Handle headers in init options
        if (init?.headers) {
            const headers = new Headers(init.headers);
            headers.delete("Authorization");
            init = { ...init, headers };
        }
    }
    return originalFetch.call(this, url, init);
};

config.litePluginSettings[PYODIDE_KERNEL].loadPyodideOptions.env = {
    __gxy__: JSON.stringify(searchParams),
};
config.settingsOverrides = {};
config.settingsOverrides[AI_SETTINGS] = {
    defaultProvider: "jnaut",
    useSameProviderForChatAndCompleter: false,
    providers: [
        {
            id: "jnaut",
            name: "jnaut",
            provider: "generic",
            model: "jnaut",
            baseURL: galaxyApiBase,
            parameters: {
                maxTokens: 4096,
            },
        },
    ],
};
