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

const virtualFS = new Map();

let scope = "";

self.addEventListener("install", (event) => {
    console.log("[GHOST] Installing...");
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
    if (event.data.type === "CONFIGURE") {
        scope = event.data.scope;
        console.log("[SW] Updating scope", scope);
    }
});

self.addEventListener("fetch", (event) => {
    console.log("[SW] Intercept:", event.request.url);
    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === self.location.origin;
    const scoped = scope.endsWith("/") ? scope : scope + "/";
    if (isSameOrigin) {
        if (event.request.method === "GET" && url.pathname.startsWith(scoped)) {
            const path = decodeURIComponent(url.pathname).split("?")[0];
            if (virtualFS.has(path)) {
                const mime = getMimeType(path);
                const content = virtualFS.get(path);
                event.respondWith(new Response(content, { headers: { "Content-Type": mime } }));
                return;
            }
            event.respondWith(new Response("Not Found", { status: 404, statusText: "Not Found" }));
            return;
        }
        console.error("[SW] Blocking same-origin request:", url.href);
        event.respondWith(
            new Response("Blocked by Service Worker", {
                status: 403,
                statusText: "Forbidden",
                headers: { "Content-Type": "text/plain" },
            }),
        );
        return;
    }
});
