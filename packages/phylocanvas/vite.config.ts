import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

import commonjs from "vite-plugin-commonjs";
import vue from "@vitejs/plugin-vue";

import { viteConfigCharts } from "./vite.config.charts";

export default defineConfig({
    ...viteConfigCharts,
    plugins: [vue(), commonjs()],
    test: {
        globals: true,
        environment: "jsdom",
        exclude: [...configDefaults.exclude, "e2e/*"],
    },
});
