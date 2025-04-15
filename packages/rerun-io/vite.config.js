import { defineConfig } from "vite";
import { viteConfigCharts } from "./vite.config.charts";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
    ...viteConfigCharts,
    optimizeDeps: {
        exclude: process.env.NODE_ENV === "production" ? [] : ["@rerun-io/web-viewer"],
    },
    plugins: [
        {
            name: "patch-inline-url-to-variable",
            enforce: "pre",
            transform(code) {
                return {
                    code: code.replace(
                        `return fetch(new URL("./re_viewer_bg.wasm", import.meta.url));`,
                        `const wasmPath = "./re_viewer_bg.wasm"; return fetch(new URL(wasmPath, import.meta.url));`,
                    ),
                    map: null,
                };
            },
        },
        viteStaticCopy({
            targets: [
                {
                    src: "node_modules/@rerun-io/web-viewer/re_viewer_bg.wasm",
                    dest: "",
                },
            ],
        }),
    ],
});
