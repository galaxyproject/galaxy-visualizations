import { defineConfig } from "vite";

const env = {
  GALAXY_DATASET_ID: "",
  GALAXY_KEY: "",
  GALAXY_ROOT: "",
};

Object.keys(env).forEach((key) => {
  if (process.env[key]) {
    env[key] = process.env[key];
  } else {
    console.log(
      `${key} not available. Please provide as environment variable.`,
    );
  }
});

const galaxyRoot = env.GALAXY_ROOT || "http://127.0.0.1:8080";

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

const serverConfig = {};
if (isValidUrl(galaxyRoot)) {
  serverConfig.proxy = {
    "/api": {
      changeOrigin: true,
      target: galaxyRoot,
      rewrite: (path) => {
        if (env.GALAXY_KEY) {
          const separator = path.includes("?") ? "&" : "?";
          return `${path}${separator}key=${env.GALAXY_KEY}`;
        } else {
          return path;
        }
      },
    },
  };
} else {
  console.log(
    `GALAXY_ROOT "${galaxyRoot}" is not a valid URL. Skipping proxy setup.`,
  );
}

export default defineConfig({
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
    "process.env.credentials": JSON.stringify(
      env.GALAXY_KEY ? "omit" : "include",
    ),
    "process.env.dataset_id": JSON.stringify(env.GALAXY_DATASET_ID),
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    ...serverConfig,
    watch: {
      ignored: ["**/node_modules/**", "**/test-data/**"],
    },
    cors: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
