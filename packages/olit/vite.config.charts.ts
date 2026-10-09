import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";

import { defaultEndpoint, PROVIDERS } from "./src/agent/providers";

const env = {
  GALAXY_KEY: "",
  GALAXY_ROOT: "http://127.0.0.1:8080",
  // Names a built-in provider (galaxy | gemini | deepseek | openrouter | local). Setting it is
  // enough; LLM_ROOT/LLM_PATH below are only for an endpoint the registry lacks.
  LLM_PROVIDER: "",
  LLM_ROOT: "",
  // Path the /llm proxy rewrites to; Gemini's native API is /v1beta.
  LLM_PATH: "",
  // Provider key, kept in the environment because the manifest is committed.
  LLM_KEY: "",
  // Overrides <ai_model> for a dev run; empty means use the manifest.
  LLM_MODEL: "",
  // The context window that decides when the agent compacts; lower it for a small model.
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

/** The /llm proxy's origin and path for each provider: Olit's endpoint, or pi's for its own. */
async function llmTargets(): Promise<Record<string, { root: string; path: string }>> {
  const endpoints = await Promise.all(PROVIDERS.map(async (p) => [p.id, await defaultEndpoint(p)]));
  return Object.fromEntries(
    endpoints
      .filter((entry): entry is [string, string] => !!entry[1])
      .map(([id, endpoint]) => {
        const url = new URL(endpoint);
        return [id, { root: url.origin, path: url.pathname === "/" ? "/v1" : url.pathname }];
      }),
  );
}

/** The commit this bundle was built from; a deployed copy cannot be identified without it. */
function buildCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const targets = await llmTargets();
if (env.LLM_PROVIDER && !targets[env.LLM_PROVIDER] && !env.LLM_ROOT) {
  // Falling through to the local default here is the trap that answers with the wrong model.
  const known = Object.keys(targets).sort().join(", ") || "none readable";
  throw new Error(`LLM_PROVIDER=${env.LLM_PROVIDER} is not in the agent's registry (${known}).`);
}
const llmTarget = targets[env.LLM_PROVIDER] || { root: "http://127.0.0.1:11434", path: "/v1" };
const llmRoot = env.LLM_ROOT || llmTarget.root;
const llmPath = env.LLM_PATH || llmTarget.path;

/**
 * What the bundle is compiled with. The dev server passes the shell's settings; a build passes
 * none, because a build is what Galaxy serves and a developer's routing must not reach it.
 */
export function defines(settings: Partial<typeof env> = {}): Record<string, string> {
  return {
    "process.env.credentials": JSON.stringify(settings.GALAXY_KEY ? "omit" : "include"),
    "process.env.olit_commit": JSON.stringify(buildCommit()),
    "process.env.olit_built": JSON.stringify(new Date().toISOString()),
    // Dev only: route the agent through the /llm proxy above, which attaches the key.
    "process.env.llm_base_url": JSON.stringify(
      settings.LLM_PROVIDER || settings.LLM_ROOT ? "/llm" : "",
    ),
    "process.env.llm_provider": JSON.stringify(settings.LLM_PROVIDER ?? ""),
    "process.env.llm_model": JSON.stringify(settings.LLM_MODEL ?? ""),
    "process.env.llm_context_window": JSON.stringify(settings.LLM_CONTEXT_WINDOW ?? ""),
    "process.env.llm_keep_recent_tokens": JSON.stringify(settings.LLM_KEEP_RECENT_TOKENS ?? ""),
  };
}

// https://vitejs.dev/config/
export const viteConfigCharts = defineConfig({
  base: "./",
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
  define: defines(env),
  server: {
    proxy: {
      "/api": proxyGalaxy(),
      // Galaxy serves its OpenAPI spec here; the scoped catalog fetches it.
      "/openapi.json": proxyGalaxy(),
      // Visualization plugins the artifact pane mounts, from where Galaxy serves them.
      "/static/plugins/visualizations": proxyGalaxy(),
      // Dev LLM proxy; the key is attached here so it never reaches page JS.
      "/llm": {
        changeOrigin: true,
        target: llmRoot,
        rewrite: (path: string) => path.replace(/^\/llm/, llmPath),
        // Gemini's native API takes its key in its own header; the rest take a bearer token.
        headers: !env.LLM_KEY
          ? undefined
          : env.LLM_PROVIDER === "google"
            ? { "x-goog-api-key": env.LLM_KEY }
            : { Authorization: `Bearer ${env.LLM_KEY}` },
      },
    },
  },
});
