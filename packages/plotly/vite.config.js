import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

import tailwindcss from "tailwindcss";
import vue from "@vitejs/plugin-vue";

import { viteConfigCharts } from "./vite.config.charts";

export default defineConfig({
    ...viteConfigCharts,
    plugins: [vue(), tailwindcss()],
    test: {
        globals: true,
        environment: "jsdom",
        exclude: [...configDefaults.exclude, "e2e/*"],
    },
});
