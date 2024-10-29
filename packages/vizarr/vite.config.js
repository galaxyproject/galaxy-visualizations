import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";
import vue from "@vitejs/plugin-vue";
import path from "path";
import serverConfig from "./server.config";

let GALAXY_SERVER = "";
if (process.env.GALAXY_SERVER) {
    GALAXY_SERVER = process.env.GALAXY_SERVER;
} else if (serverConfig.GALAXY_SERVER) {
    GALAXY_SERVER = serverConfig.GALAXY_SERVER;
} else {
    console.warn("GALAXY_SERVER not available. Please provide as environment variable or specify in 'server.config'.");
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    build: {
        outDir: "./static/dist",
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks: () => "app.js",
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
                assetFileNames: "[name][extname]",
            },
        },
    },
    server: {
        proxy: {
            "/api": {
                target: `${GALAXY_SERVER}/api`,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
            "/datasets": {
                target: `${GALAXY_SERVER}/datasets`,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/datasets/, ""),
            },
        },
    },
});
