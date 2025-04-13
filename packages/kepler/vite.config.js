import { defineConfig } from "vite";
import { viteConfigCharts } from "./vite.config.charts";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";

export default defineConfig({
    ...viteConfigCharts,
    define: {
        "process.env.MapboxAccessToken": JSON.stringify(process.env.MapboxAccessToken),
        global: "globalThis",
    },
    optimizeDeps: {
        esbuildOptions: {
            define: {
                global: "globalThis",
            },
            plugins: [
                NodeGlobalsPolyfillPlugin({
                    process: true,
                    buffer: true,
                }),
                NodeModulesPolyfillPlugin(),
            ],
        },
    },
    resolve: {
        alias: {
            assert: "assert",
            process: "process/browser",
            buffer: "buffer",
        },
    },
});
