import { defineConfig } from "vite";

// collect Galaxy server root
let GALAXY_ROOT = "http://127.0.0.1:8080";
if (process.env.GALAXY_ROOT) {
    GALAXY_ROOT = process.env.GALAXY_ROOT;
} else {
    console.log("GALAXY_ROOT not available. Please provide as environment variable.");
}

// collect Galaxy API key
let GALAXY_KEY = "";
if (process.env.GALAXY_KEY) {
    GALAXY_KEY = process.env.GALAXY_KEY;
} else {
    console.log("GALAXY_KEY not available. Please provide as environment variable to access a remote Galaxy instance.");
}

// https://vitejs.dev/config/
export const viteConfigCharts = defineConfig({
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
    define: {
        "process.env.credentials": JSON.stringify(GALAXY_KEY ? "omit" : "include"),
    },
    resolve: {
        alias: {
            "@": "/src",
        },
    },
    server: {
        proxy: {
            "/api": {
                changeOrigin: true,
                rewrite: (path) => {
                    if (GALAXY_KEY) {
                        const separator = path.includes("?") ? "&" : "?";
                        return `${path}${separator}key=${GALAXY_KEY}`;
                    } else {
                        return path;
                    }
                },
                target: GALAXY_ROOT,
            },
        },
    },
});
