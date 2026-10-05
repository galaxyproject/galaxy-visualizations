import fs from "node:fs";
import path from "node:path";
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
  ],
});

/** Pyodide's files as they are, as Galaxy serves them: the dev server would transform its scripts. */
const servePyodide = {
  name: "olit-pyodide",
  configureServer(server) {
    const root = path.resolve("static/pyodide");
    server.middlewares.use("/static/pyodide", (req, res, next) => {
      const file = path.join(root, decodeURIComponent((req.url || "").split("?")[0]));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return next();
      }
      const types = {
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
      };
      res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
      fs.createReadStream(file).pipe(res);
    });
  },
};

export default defineConfig(({ command }) => ({
  ...viteConfigCharts,
  plugins: command === "build" ? [staticCopyPlugin] : [servePyodide],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{js,ts}"],
  },
  worker: {
    format: "es",
  },
}));
