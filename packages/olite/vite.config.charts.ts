import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";

const env = {
    GALAXY_DATASET_ID: "",
    GALAXY_KEY: "",
    GALAXY_ROOT: "http://127.0.0.1:8080",
    // Names a built-in provider (galaxy | gemini | deepseek | openrouter | local). Setting it is
    // enough; LLM_ROOT/LLM_PATH below are only for an endpoint the registry lacks.
    LLM_PROVIDER: "",
    LLM_ROOT: "",
    // Path the /llm proxy rewrites to; Gemini's shim is /v1beta/openai.
    LLM_PATH: "",
    // Provider key, kept in the environment because the manifest is committed.
    LLM_KEY: "",
    // Overrides <ai_model> for a dev run; empty means use the manifest.
    LLM_MODEL: "",
    // The context window that decides when the brain compacts; lower it for a small model.
    LLM_CONTEXT_WINDOW: "",
    // How much recent conversation compaction keeps; clamped to what the window holds.
    LLM_KEEP_RECENT_TOKENS: "",
};

type EnvKeyType = keyof typeof env;

Object.keys(env).forEach((key) => {
    if (process.env[key]) {
        env[key as EnvKeyType] = process.env[key] as string;
    } else {
        console.log(`${key} not available. Please provide as environment variable.`);
    }
});

const proxyGalaxy = () => ({
    changeOrigin: true,
    rewrite: (path: string) => {
        if (env.GALAXY_KEY) {
            const separator = path.includes("?") ? "&" : "?";
            return `${path}${separator}key=${env.GALAXY_KEY}`;
        }
        return path;
    },
    target: env.GALAXY_ROOT,
});

// The /llm proxy needs a concrete origin. The brain's registry is the authority for what
// each provider's is, so read it rather than restating it here and letting the two drift.
const READ_REGISTRY = [
    "import json",
    "from urllib.parse import urlsplit",
    "from olite.substrate.llm.providers import REGISTRY",
    "out = {}",
    "for p in REGISTRY.values():",
    "    if not p.base_url:",
    "        continue",
    "    u = urlsplit(p.base_url)",
    "    out[p.id] = {'root': f'{u.scheme}://{u.netloc}', 'path': u.path or '/v1'}",
    "print(json.dumps(out))",
].join("\n");

function llmTargets(): Record<string, { root: string; path: string }> {
    try {
        const out = execFileSync("python3", ["-c", READ_REGISTRY], { cwd: "brain", encoding: "utf8" });
        return JSON.parse(out);
    } catch {
        console.warn("Could not read the provider registry; set LLM_ROOT and LLM_PATH explicitly.");
        return {};
    }
}

const targets = llmTargets();
if (env.LLM_PROVIDER && !targets[env.LLM_PROVIDER] && !env.LLM_ROOT) {
    // Falling through to the local default here is the trap that answers with the wrong model.
    const known = Object.keys(targets).sort().join(", ") || "none readable";
    throw new Error(`LLM_PROVIDER=${env.LLM_PROVIDER} is not in the brain's registry (${known}).`);
}
const llmTarget = targets[env.LLM_PROVIDER] || { root: "http://127.0.0.1:11434", path: "/v1" };
const llmRoot = env.LLM_ROOT || llmTarget.root;
const llmPath = env.LLM_PATH || llmTarget.path;

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
        // Dev only: route the brain through the /llm proxy above, which attaches the key.
        "process.env.llm_base_url": JSON.stringify(env.LLM_ROOT ? "/llm" : ""),
        "process.env.llm_provider": JSON.stringify(env.LLM_PROVIDER),
        "process.env.llm_model": JSON.stringify(env.LLM_MODEL),
        "process.env.llm_context_window": JSON.stringify(env.LLM_CONTEXT_WINDOW),
        "process.env.llm_keep_recent_tokens": JSON.stringify(env.LLM_KEEP_RECENT_TOKENS),
    },
    resolve: {
        alias: {
            "@": "/src",
        },
    },
    server: {
        proxy: {
            "/api": proxyGalaxy(),
            // Galaxy serves its OpenAPI spec here; the scoped catalog fetches it.
            "/openapi.json": proxyGalaxy(),
            // Dev LLM proxy; the key is attached here so it never reaches page JS.
            "/llm": {
                changeOrigin: true,
                target: llmRoot,
                rewrite: (path: string) => path.replace(/^\/llm/, llmPath),
                headers: env.LLM_KEY ? { Authorization: `Bearer ${env.LLM_KEY}` } : undefined,
            },
        },
    },
});
