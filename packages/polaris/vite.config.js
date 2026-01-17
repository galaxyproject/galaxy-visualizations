import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import yaml from "@rollup/plugin-yaml";

import { viteConfigCharts } from "./vite.config.charts";

const staticCopyPlugin = viteStaticCopy({
    targets: [
        {
            src: "node_modules/pyodide/*",
            dest: "pyodide",
            overwrite: true,
        },
        {
            src: "temp/pyodide/*.whl",
            dest: "pyodide",
            overwrite: true,
        },
        {
            src: "src/pyodide/pyodide-worker.js",
            dest: "pyodide",
            overwrite: true,
        },
        {
            src: "polaris/dist/polaris-*.whl",
            dest: "pyodide",
            overwrite: true,
        },
        {
            src: "polaris_dataset_report/dist/polaris_dataset_report-*.whl",
            dest: "pyodide",
            overwrite: true,
        },
    ],
});

export default defineConfig(({ command }) => ({
    ...viteConfigCharts,
    plugins: [tailwindcss(), ...(command === "build" ? [staticCopyPlugin] : []), vue(), yaml()],
    test: {
        environment: "happy-dom",
        globals: true,
        include: ["src/**/*.test.{js,ts,jsx,tsx}"],
    },
    worker: {
        format: "es",
    },
}));
