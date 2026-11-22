import { defineConfig } from "vite";
import { viteConfigCharts } from "./vite.config.charts.ts";

export default defineConfig({
    ...viteConfigCharts,
    optimizeDeps: {
        exclude: process.env.NODE_ENV === "production" ? [] : ["@rerun-io/web-viewer"],
    },
});
