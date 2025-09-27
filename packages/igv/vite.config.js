import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

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
        exclude: [...configDefaults.exclude, "e2e/*"],
    },
});
