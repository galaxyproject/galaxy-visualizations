import { defineConfig } from "vite";
import { viteConfigCharts } from "./vite.config.charts";

export default defineConfig({
  ...viteConfigCharts,
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["*.test.{js,ts}"],
  },
});
