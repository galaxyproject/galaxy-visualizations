import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [],
    build: {
        outDir: "./static/dist",
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
                assetFileNames: "[name][extname]",
            },
        },
    },
    resolve: {
        alias: {
            "@": "/src",
        },
    },
});
