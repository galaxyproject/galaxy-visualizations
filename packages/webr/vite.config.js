import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { viteConfigCharts } from "./vite.config.charts.js";

const WEBR_DIST = resolve(dirname(fileURLToPath(import.meta.url)), "node_modules/webr/dist");
const WEBR_FILES = ["R.js", "R.wasm", "libRblas.so", "libRlapack.so", "webr-worker.js", "vfs"];
const MIME_TYPES = { ".js": "text/javascript", ".wasm": "application/wasm" };

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
        },
    };
}

export default defineConfig({
    ...viteConfigCharts,
    plugins: [vue(), tailwindcss(), webrRuntime()],
});
