import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

import vue from "@vitejs/plugin-vue";

import { viteConfigCharts } from "./vite.config.charts";

export default defineConfig({
    ...viteConfigCharts,
    plugins: [vue()],
    test: {
        globals: true,
        environment: "node",
        exclude: [...configDefaults.exclude, "e2e/*"],
    },
});
