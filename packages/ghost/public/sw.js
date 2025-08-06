const getMimeType = (path) => {
    const mimeMap = {
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".jsonp": "application/javascript",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".html": "text/html",
        ".svg": "image/svg+xml",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
    };
    const ext = path.slice(path.lastIndexOf(".")).split("?")[0];
    return mimeMap[ext] || "text/plain";
};

// In-memory file storage
const virtualFS = new Map();

let scope = "/";

self.addEventListener("install", (event) => {
    console.log("[GHOST] Installing...");
    /*if (!self.registration.scope.startsWith(self.location.origin + "/sandbox/")) {
        console.warn("[GHOST] Invalid scope, unregistering...");
        event.waitUntil(self.registration.unregister());
        return;
    }*/
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    console.log("[GHOST] Activating...");
    event.waitUntil(clients.claim());
});

self.addEventListener("message", (event) => {
    if (event.data.type === "ADD") {
        virtualFS.set(event.data.path, event.data.content);
        console.log("[SW] Adding", event.data.path);
    }
    if (event.data.type === "SCOPE") {
        scope = event.data.content;
        console.log("[SW] Updating scope", scope);
    }
});

self.addEventListener("fetch", (event) => {
    // Only permit GET requests from same origin
    console.log("[SW] Intercept:", event.request.url);
    const url = new URL(event.request.url);
    if (event.request.method === "GET" && url.pathname.startsWith(scope)) {
        // Only permit access to files provided in fs
        const path = decodeURIComponent(url.pathname).split("?")[0];
        if (virtualFS.has(path)) {
            const mime = getMimeType(path);
            const content = virtualFS.get(path);
            const response = new Response(content, {
                headers: { "Content-Type": mime },
            });
            event.respondWith(response);
        }
    } else {
        console.error("[SW] Rejecting request to", url);
    }
});
