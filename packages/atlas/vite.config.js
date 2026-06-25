import { defineConfig } from "vite";
import { viteConfigCharts } from "./vite.config.charts";
import react from "@vitejs/plugin-react";

export default defineConfig({
    ...viteConfigCharts,
    plugins: [react()],
    optimizeDeps: {
        exclude: ["@uwdata/mosaic-core", "embedding-atlas"],
    },
    worker: { format: "es" },
});
