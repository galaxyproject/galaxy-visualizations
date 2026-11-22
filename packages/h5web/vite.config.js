import { defineConfig } from "vite";
import { viteConfigCharts } from "./vite.config.charts.js";
import react from '@vitejs/plugin-react';

export default defineConfig({
    ...viteConfigCharts,
    /* Insert your existing vite.config settings here. */
    plugins: [react()],
});
