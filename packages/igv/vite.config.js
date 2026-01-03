import { defineConfig } from "vite";

import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import yaml from "./vite.yml.js";

import { viteConfigCharts } from "./vite.config.charts";

export default defineConfig({
    ...viteConfigCharts,
    plugins: [vue(), tailwindcss(), yaml()],
    test: {
        globals: true,
        environment: "happy-dom",
        include: ["src/**/*.test.{js,ts,jsx,tsx}"],
    },
});
