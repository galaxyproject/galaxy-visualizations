import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

import { viteConfigCharts } from "./vite.config.charts";

// Vendor the complete, unmodified upstream vaRRI-js viewer
// (https://www.npmjs.com/package/varri-js) into the build output, so
// main.js can embed it in an <iframe> - see main.js's module docstring for
// why we embed the upstream viewer wholesale instead of reimplementing any
// part of its UI. vite-plugin-static-copy also serves these files during
// `vite dev`/`vite preview`, not just `vite build` (unlike a plain
// predev/prebuild script), so no separate dev-mode handling is needed.
const staticCopyPlugin = viteStaticCopy({
  targets: [
    {
      src: "node_modules/varri-js/*",
      dest: "vendor/varri-js",
    },
  ],
});

export default defineConfig({
  ...viteConfigCharts,
  plugins: [staticCopyPlugin],
});
