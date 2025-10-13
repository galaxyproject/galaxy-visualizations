import { defineConfig } from "vite";

import tailwindcss from "tailwindcss";
import vue from "@vitejs/plugin-vue";
import yaml from "./vite.yml.js";

import { viteConfigCharts } from "./vite.config.charts";

export default defineConfig({
    ...viteConfigCharts,
    plugins: [vue(), tailwindcss(), yaml()],
    test: {
        globals: true,
        environment: "jsdom",
        include: ["src/**/*.test.{js,ts,jsx,tsx}"],
    },
});
