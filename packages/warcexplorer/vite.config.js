import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "static",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "index.js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  define: {
    "process.env.dataset_id": JSON.stringify(process.env.GALAXY_DATASET_ID || ""),
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.GALAXY_ROOT || "http://127.0.0.1:8080",
        changeOrigin: true,
        rewrite(path) {
          const key = process.env.GALAXY_KEY;
          return key ? `${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}` : path;
        },
      },
    },
  },
});
