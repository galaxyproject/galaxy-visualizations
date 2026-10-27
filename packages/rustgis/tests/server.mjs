import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../static/", import.meta.url));
const prefix = "/galaxy/visualizations/rustgis/";
const mime = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".geojson": "application/json",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/galaxy/harness") {
        const config = { root: "/galaxy/", visualization_config: { dataset_id: url.searchParams.get("dataset_id") } };
        // The real host injects only the entry-point script and CSS into an
        // about:blank frame; the package's demo index.html is never loaded.
        res.setHeader("Content-Type", "text/html");
        res.end(`<!doctype html><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style>
            <iframe id="galaxy_visualization" title="Galaxy visualization"></iframe><script>
            const frame = document.querySelector('iframe');
            const doc = frame.contentDocument;
            const app = doc.createElement('div'); app.id = 'app';
            const incoming = ${JSON.stringify(config).replaceAll("<", "\\u003c")};
            incoming.root = new URL(incoming.root, location.href).href;
            app.setAttribute('data-incoming', JSON.stringify(incoming)); doc.body.append(app);
            const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = '${prefix}index.css'; doc.head.append(css);
            const script = doc.createElement('script'); script.type = 'module'; script.src = '${prefix}index.js'; doc.body.append(script);
            </script>`);
        return;
    }
    const relative = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname.slice(1);
    const file = path.resolve(root, decodeURIComponent(relative || "index.html"));
    if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
    }
    try {
        const bytes = await readFile(file);
        res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
        res.end(bytes);
    } catch {
        res.writeHead(404).end();
    }
}).listen(Number(process.argv[2] || 5198), "127.0.0.1");
