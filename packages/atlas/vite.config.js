import { defineConfig } from "vite";
import { viteConfigCharts } from "./vite.config.charts";
import react from "@vitejs/plugin-react";

export default defineConfig({
    ...viteConfigCharts,
    plugins: [react()],
    // DuckDB-WASM ships large Wasm + Worker bundles; let Vite serve them as-is
    // in dev rather than trying to pre-bundle them.
    optimizeDeps: {
        exclude: ["@uwdata/mosaic-core", "embedding-atlas"],
    },
    worker: {
        format: "es",
    },
});
