import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

import { viteConfigCharts } from "./vite.config.charts";

const staticCopyPlugin = viteStaticCopy({
  targets: [
    {
      src: "node_modules/pyodide/*",
      dest: "pyodide",
      overwrite: true,
    },
    {
      src: "temp/pyodide/*.whl",
      dest: "pyodide",
      overwrite: true,
    },
    {
      src: "src/pyodide/pyodide-worker.js",
      dest: "pyodide",
      overwrite: true,
    },
    {
      src: "src/pyodide/llm-fetch.js",
      dest: "pyodide",
      overwrite: true,
    },
    {
      src: "brain/dist/olit-*.whl",
      dest: "pyodide",
      overwrite: true,
    },
  ],
});

export default defineConfig(({ command }) => ({
  ...viteConfigCharts,
  plugins: [...(command === "build" ? [staticCopyPlugin] : [])],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{js,ts}"],
  },
  worker: {
    format: "es",
  },
}));
