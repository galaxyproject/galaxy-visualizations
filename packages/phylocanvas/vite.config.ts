import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

import commonjs from "vite-plugin-commonjs";
import vue from "@vitejs/plugin-vue";

import { viteConfigCharts } from "./vite.config.charts";

export default defineConfig({
    ...viteConfigCharts,
    plugins: [vue(), commonjs()],
    optimizeDeps: {
        //include: ["@/phylocanvas.min.js"], // Replace with the actual package name
        //exclude: ["@deck.gl/core"],
    },
    test: {
        globals: true,
        environment: "jsdom",
        exclude: [...configDefaults.exclude, "e2e/*"],
    },
});
