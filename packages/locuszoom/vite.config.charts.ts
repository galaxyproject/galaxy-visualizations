import { defineConfig } from "vite";

const env = {
    GALAXY_DATASET_ID: "",
    GALAXY_HISTORY_ID: "",
    GALAXY_KEY: "a2b9011787229ae03861f0de224ffc6b",
    GALAXY_ROOT: "http://localhost:8080/",
};

Object.keys(env).forEach((key) => {
    if (process.env[key]) {
        env[key] = process.env[key];
    } else {
        console.log(`${key} not available. Please provide as environment variable.`);
    }
});

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
        "process.env.credentials": JSON.stringify(env.GALAXY_KEY ? "omit" : "include"),
        "process.env.dataset_id": JSON.stringify(env.GALAXY_DATASET_ID),
        "process.env.history_id": JSON.stringify(env.GALAXY_HISTORY_ID),
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
                    if (env.GALAXY_KEY) {
                        const separator = path.includes("?") ? "&" : "?";
                        return `${path}${separator}key=${env.GALAXY_KEY}`;
                    } else {
                        return path;
                    }
                },
                target: env.GALAXY_ROOT,
            },
        },
    },
});
