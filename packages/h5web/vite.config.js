import { defineConfig } from "vite";
import { viteConfigCharts } from "./vite.config.charts";
import react from '@vitejs/plugin-react';

export default defineConfig({
    ...viteConfigCharts,
    /* Insert your existing vite.config settings here. */
    plugins: [react()],
});