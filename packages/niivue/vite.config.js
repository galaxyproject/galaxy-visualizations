import { defineConfig } from "vite";

import tailwindcss from "tailwindcss";
import vue from "@vitejs/plugin-vue";

import { viteConfigCharts } from "./vite.config.charts";

export default defineConfig({
    ...viteConfigCharts,
    plugins: [vue(), tailwindcss()],
    test: {
        globals: true,
        environment: "jsdom",
        include: ["src/**/*.test.{js,ts,jsx,tsx}"],
    },
});
