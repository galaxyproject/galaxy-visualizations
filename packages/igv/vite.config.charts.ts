import { defineConfig } from "vite";

const env = {
    GALAXY_DATASET_ID: "",
    GALAXY_KEY: "",
    GALAXY_ROOT: "http://127.0.0.1:8080",
};

type EnvKeyType = keyof typeof env;

Object.keys(env).forEach((key) => {
    if (process.env[key]) {
        env[key as EnvKeyType] = process.env[key] as string;
    } else {
        console.log(`${key} not available. Please provide as environment variable.`);
    }
});

// https://vitejs.dev/config/
export const viteConfigCharts = defineConfig({
    build: {
        outDir: "./static",
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
