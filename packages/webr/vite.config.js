import {
    cpSync,
    createReadStream,
    existsSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { viteConfigCharts } from "./vite.config.charts.js";

const WEBR_DIST = resolve(dirname(fileURLToPath(import.meta.url)), "node_modules/webr/dist");
const WEBR_FILES = ["R.js", "R.wasm", "libRblas.so", "libRlapack.so", "webr-worker.js", "vfs"];
const MIME_TYPES = { ".js": "text/javascript", ".wasm": "application/wasm" };

const ORIGIN_PATCH = { from: "new URL(r,location.origin)", to: "new URL(r,self.origin)" };

function webrOrigin() {
    return {
        name: "webr-origin",
        transform(code, id) {
            const target = id.replaceAll("\\", "/").match(/\/node_modules\/webr\/dist\/webr\.m?js$/);
            if (target && !code.includes(ORIGIN_PATCH.from)) {
                throw new Error("webR changed: review the about:blank origin patch.");
            }
            return target ? code.replace(ORIGIN_PATCH.from, ORIGIN_PATCH.to) : null;
        },
    };
}

function decompressImages(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
        const metadataPath = join(entry.parentPath, entry.name);
        if (entry.isFile() && entry.name.endsWith(".js.metadata")) {
            const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
            const base = metadataPath.slice(0, -".js.metadata".length);
            if (metadata.gzip) {
                writeFileSync(`${base}.data`, gunzipSync(readFileSync(`${base}.data.gz`)));
                rmSync(`${base}.data.gz`);
                writeFileSync(metadataPath, JSON.stringify({ ...metadata, gzip: false }));
            }
        }
    }
}

function webrRuntime() {
    return {
        name: "webr-runtime",
        configureServer(server) {
            server.middlewares.use("/webr/", (req, res, next) => {
                const file = join(WEBR_DIST, decodeURIComponent(req.url.split("?")[0]));
                if (file.startsWith(WEBR_DIST) && existsSync(file) && statSync(file).isFile()) {
                    res.setHeader("Content-Type", MIME_TYPES[extname(file)] || "application/octet-stream");
                    createReadStream(file).pipe(res);
                } else {
                    next();
                }
            });
        },
        closeBundle() {
            const target = resolve(viteConfigCharts.build.outDir, "webr");
            for (const name of WEBR_FILES) {
                cpSync(join(WEBR_DIST, name), join(target, name), { recursive: true });
            }
            cpSync(resolve(WEBR_DIST, "../LICENSE.md"), join(target, "LICENSE.md"));
            decompressImages(join(target, "vfs"));
        },
    };
}

export default defineConfig({
    ...viteConfigCharts,
    optimizeDeps: { exclude: ["webr"] },
    plugins: [vue(), tailwindcss(), webrOrigin(), webrRuntime()],
});
