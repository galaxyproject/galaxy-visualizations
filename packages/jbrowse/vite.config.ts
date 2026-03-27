import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";

import { viteConfigCharts } from "./vite.config.charts";

// https://vitejs.dev/config/
export default defineConfig({
    ...viteConfigCharts,
    plugins: [react(), vue()],
    base: "./",
    worker: {
        format: "es",
    },
});
