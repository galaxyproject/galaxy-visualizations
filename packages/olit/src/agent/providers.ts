import type { Api, Provider as PiProvider } from "@earendil-works/pi-ai";

const DEFAULT_RATE_LIMIT = 30;

export interface ProviderModel {
  id: string;
  /** Only for a model pi's catalog does not list; pi's own figure wins otherwise. */
  contextWindow?: number;
}

/**
 * Overrides of pi-ai's openai-completions compat detection, which keys on provider id and
 * host, for the endpoints Olit defines itself. Each one names something such an endpoint was
 * seen to reject or require.
 */
export interface ProviderCompat {
  /** pi sends `store` to any host it does not list as non-standard; only OpenAI defines it. */
  supportsStore?: boolean;
  maxTokensField?: "max_tokens" | "max_completion_tokens";
  /** The record excerpt sits before the latest user turn rather than folded into the prompt. */
  supportsMidConvoSystemMessages?: boolean;
}

/** OpenAI-compatible servers that read only the older `max_tokens` (Galaxy, vLLM, llama.cpp). */
const SELF_HOSTED: ProviderCompat = {
  supportsStore: false,
  supportsMidConvoSystemMessages: true,
  maxTokensField: "max_tokens",
};

/**
 * pi-ai's own definition of each provider it knows: its endpoint, wire API, key variable,
 * compat and catalog are pi's, loaded when a session or a page needs them.
 */
const PI: Record<string, () => Promise<PiProvider<Api>>> = {
  google: () => import("@earendil-works/pi-ai/providers/google").then((m) => m.googleProvider()),
  deepseek: () =>
    import("@earendil-works/pi-ai/providers/deepseek").then((m) => m.deepseekProvider()),
  openrouter: () =>
    import("@earendil-works/pi-ai/providers/openrouter").then((m) => m.openrouterProvider()),
  openai: () => import("@earendil-works/pi-ai/providers/openai").then((m) => m.openaiProvider()),
  anthropic: () =>
    import("@earendil-works/pi-ai/providers/anthropic").then((m) => m.anthropicProvider()),
  groq: () => import("@earendil-works/pi-ai/providers/groq").then((m) => m.groqProvider()),
  mistral: () => import("@earendil-works/pi-ai/providers/mistral").then((m) => m.mistralProvider()),
  xai: () => import("@earendil-works/pi-ai/providers/xai").then((m) => m.xaiProvider()),
};

/** pi's definition of a provider, or undefined for one Olit defines itself. */
export const piProvider = (id: string) => PI[id]?.();

/** Whether pi defines this provider, so Olit sets nothing of its wire behaviour. */
export const isPiProvider = (id: string) => id in PI;

export interface Provider {
  id: string;
  name: string;
  /** Suggestions for the picker; pi's catalog describes them. */
  models?: ProviderModel[];
  rateLimit?: number;
  /** Below, only for a provider Olit defines itself. */
  compat?: ProviderCompat;
  baseUrl?: string;
  /** The environment variable a headless run reads the key from; none means no user key. */
  authEnv?: string;
  /** Galaxy's own ceiling on max_tokens. */
  maxTokens?: number;
  /** The server reports its own context window. */
  probeWindow?: boolean;
}

export const PROVIDERS: Provider[] = [
  { id: "galaxy", name: "Galaxy chat proxy", maxTokens: 8192, compat: SELF_HOSTED },
  {
    id: "google",
    name: "Google Gemini",
    rateLimit: 5,
    models: [{ id: "gemini-3.7-flash" }, { id: "gemini-3.1-flash-lite" }],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    models: [{ id: "deepseek-v4-flash", contextWindow: 1_000_000 }],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    models: [
      { id: "anthropic/claude-sonnet-5" },
      { id: "openai/gpt-5.6-terra" },
      { id: "deepseek/deepseek-v4-flash-0731" },
      { id: "google/gemini-3.7-flash" },
      { id: "google/gemini-3.1-flash-lite" },
    ],
  },
  {
    id: "jetstream2",
    name: "Jetstream2",
    baseUrl: "https://llm.jetstream-cloud.org/api",
    authEnv: "JETSTREAM2_KEY",
    compat: SELF_HOSTED,
    models: [
      { id: "gpt-oss-120b", contextWindow: 131_072 },
      { id: "llama-4-scout", contextWindow: 328_000 },
    ],
  },
  {
    id: "ollama",
    name: "Ollama or a local server",
    baseUrl: "http://127.0.0.1:11434/v1",
    compat: SELF_HOSTED,
    probeWindow: true,
  },
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "groq", name: "Groq" },
  { id: "mistral", name: "Mistral" },
  { id: "xai", name: "xAI" },
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);

/** Whether a provider takes a key of the user's. */
export const needsKey = (p: Provider) => isPiProvider(p.id) || !!p.authEnv;

/** The Galaxy proxy picks its own model; every other endpoint is told which. */
export const takesModel = (p: Provider) => p.id !== "galaxy";

/** Where a provider's requests go unless an endpoint is typed: pi's for a provider pi defines. */
export async function defaultEndpoint(p: Provider): Promise<string | undefined> {
  return p.baseUrl ?? (await piProvider(p.id))?.baseUrl;
}

export interface LlmConfig {
  ai_provider?: string;
  ai_base_url?: string;
  ai_api_key?: string;
  ai_model?: string;
  ai_max_tokens?: number;
  ai_context_window?: number;
  ai_rate_limit?: number;
}

export interface Target {
  provider: Provider;
  model: string;
  /** A typed or proxied endpoint, or an Olit-defined provider's; pi's own otherwise. */
  baseUrl?: string;
  /** The configured key, or for an Olit-defined provider the one its variable holds. */
  apiKey?: string;
  /** Configured, probed, or listed here; otherwise pi's catalog or a default decides. */
  contextWindow?: number;
  maxTokens?: number;
  rateLimit: number;
}

/** The endpoint a config points at: named provider, else a custom one, else Galaxy. */
export function resolve(config: LlmConfig, env: Record<string, string | undefined> = {}): Target {
  const named = config.ai_provider;
  let provider: Provider | undefined;
  if (named) {
    provider = PROVIDERS.find((p) => p.id === named);
    if (!provider) {
      throw new Error(
        `Unknown ai_provider '${named}'. Known: ${PROVIDERS.map((p) => p.id)
          .sort()
          .join(", ")}.`,
      );
    }
  } else if (config.ai_base_url) {
    provider = {
      id: "custom",
      name: "Custom endpoint",
      baseUrl: config.ai_base_url,
      compat: SELF_HOSTED,
    };
  } else {
    provider = PROVIDERS[0];
  }
  const model = config.ai_model || "";
  const asked = config.ai_max_tokens;
  const ceiling = provider.maxTokens;
  return {
    provider,
    model,
    baseUrl: config.ai_base_url || provider.baseUrl,
    apiKey: config.ai_api_key || (provider.authEnv ? env[provider.authEnv] : undefined),
    contextWindow:
      config.ai_context_window || provider.models?.find((m) => m.id === model)?.contextWindow,
    maxTokens: asked && ceiling ? Math.min(asked, ceiling) : asked || ceiling,
    rateLimit: config.ai_rate_limit || provider.rateLimit || DEFAULT_RATE_LIMIT,
  };
}

/** llama.cpp's /props; any other server simply does not answer it. */
export async function probeWindow(baseUrl: string): Promise<number | undefined> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/props`);
    const window = (await response.json())?.default_generation_settings?.n_ctx;
    return Number.isInteger(window) && window > 0 ? window : undefined;
  } catch {
    return undefined;
  }
}
