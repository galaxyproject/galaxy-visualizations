import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

import { viteConfigCharts } from "./vite.config.charts";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    ...viteConfigCharts,
});
