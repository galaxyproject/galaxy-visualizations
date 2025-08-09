const TIMEOUT = 100;

const virtualFS = new Map();

let ready = false;

let scope = "";

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

self.addEventListener("install", (event) => {
    console.log("[GHOST] Installing...");
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    console.log("[GHOST] Activating...");
    event.waitUntil(clients.claim());
});

self.addEventListener("message", (event) => {
    if (event.data.type === "CREATE") {
        scope = event.data.scope;
        console.log("[GHOST] Updating scope", scope);
        const files = Object.entries(event.data.files);
        for (const [path, content] of files) {
            virtualFS.set(path, content);
        }
        console.log("[GHOST] Added files:", files.length);
        ready = true;
    }
    if (event.data.type === "DESTROY") {
        virtualFS.clear();
        console.log("[GHOST] Destroyed filesystem");
        ready = false;
    }
});

self.addEventListener("fetch", (event) => {
    console.log("[GHOST] Intercepting...");

    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === self.location.origin;
    const scoped = scope.endsWith("/") ? scope : scope + "/";

    // Only handle same-origin requests
    if (isSameOrigin) {
        if (event.request.method === "GET" && url.pathname.startsWith(scoped)) {
            event.respondWith(
                (async () => {
                    const start = Date.now();
                    while (!ready) {
                        if (Date.now() - start > TIMEOUT * TIMEOUT) {
                            return new Response("Filesystem not ready", {
                                status: 503,
                                headers: { "Cache-Control": "no-store" },
                            });
                        }
                        await new Promise((r) => setTimeout(r, TIMEOUT));
                    }
                    const path = decodeURIComponent(url.pathname).split("?")[0];
                    if (virtualFS.has(path)) {
                        const mime = getMimeType(path);
                        const content = virtualFS.get(path);
                        return new Response(content, { headers: { "Content-Type": mime } });
                    }
                    return new Response("Not Found", { status: 404, statusText: "Not Found" });
                })(),
            );
            return;
        }

        // Block other same-origin requests (outside our scope)
        console.error("[GHOST] Blocking same-origin request:", url.href);
        event.respondWith(
            new Response("Blocked by Service Worker", {
                status: 403,
                statusText: "Forbidden",
                headers: { "Content-Type": "text/plain" },
            }),
        );
    }
});
