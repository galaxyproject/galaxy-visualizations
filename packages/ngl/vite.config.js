import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";
import vue from "@vitejs/plugin-vue";
import path from "path";
import serverConfig from "./server.config";

// determine server route
let GALAXY_API = "";
if (process.env.GALAXY_API) {
    GALAXY_API = process.env.GALAXY_API;
} else if (serverConfig.GALAXY_API) {
    GALAXY_API = serverConfig.GALAXY_API;
} else {
    console.warn("GALAXY_API not available. Please provide as environment variable or specify in 'server.config'.");
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
        rollupOptions: {
            output: {
                manualChunks: () => "app.js",
                entryFileNames: "static/[name].js",
                chunkFileNames: "static/[name].js",
                assetFileNames: "static/[name][extname]",
            },
        },
    },
    server: {
        proxy: {
            "/api": {
                target: GALAXY_API,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
        },
    },
});
