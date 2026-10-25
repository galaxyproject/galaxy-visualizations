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
    server: process.env.GALAXY_ROOT
        ? {
              proxy: { "/api": { target: process.env.GALAXY_ROOT, changeOrigin: true } },
          }
        : undefined,
});
