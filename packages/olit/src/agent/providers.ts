const DEFAULT_RATE_LIMIT = 30;

export interface ProviderModel {
  id: string;
  /** Only for a model pi's catalog does not list; pi's own figure wins otherwise. */
  contextWindow?: number;
}

/** The pi-ai API a provider is reached through; pi's own adapter for each. */
export type ProviderApi = "openai-completions" | "google-generative-ai";

/**
 * Overrides of pi-ai's openai-completions compat detection, which keys on provider id and
 * host. Each one names something an endpoint was seen to reject or require.
 */
export interface ProviderCompat {
  /** pi sends `store` to any host it does not list as non-standard; only OpenAI defines it. */
  supportsStore?: boolean;
  maxTokensField?: "max_tokens" | "max_completion_tokens";
  /** The record excerpt sits before the latest user turn rather than folded into the prompt. */
  supportsMidConvoSystemMessages?: boolean;
}

/** What an OpenAI-compatible endpoint other than OpenAI itself has been seen to accept. */
const OPENAI_COMPATIBLE: ProviderCompat = {
  supportsStore: false,
  supportsMidConvoSystemMessages: true,
};
/** The same, for servers that only read the older `max_tokens` (Galaxy, vLLM, llama.cpp). */
const SELF_HOSTED: ProviderCompat = { ...OPENAI_COMPATIBLE, maxTokensField: "max_tokens" };

export interface Provider {
  id: string;
  name: string;
  /** Defaults to openai-completions. */
  api?: ProviderApi;
  compat?: ProviderCompat;
  baseUrl?: string;
  /** The environment variable a headless run reads the key from; none means no user key. */
  authEnv?: string;
  models?: ProviderModel[];
  /** Galaxy's own ceiling on max_tokens. */
  maxTokens?: number;
  rateLimit?: number;
  headers?: Record<string, string>;
  /** The server reports its own context window. */
  probeWindow?: boolean;
}

export const PROVIDERS: Provider[] = [
  { id: "galaxy", name: "Galaxy chat proxy", maxTokens: 8192, compat: SELF_HOSTED },
  {
    id: "google",
    name: "Google Gemini",
    // pi's own Gemini adapter: it keeps thought signatures and sends only what Gemini defines.
    api: "google-generative-ai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    authEnv: "GEMINI_KEY",
    rateLimit: 5,
    models: [{ id: "gemini-3.7-flash" }, { id: "gemini-3.1-flash-lite" }],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    authEnv: "DEEPSEEK_KEY",
    // pi already detects DeepSeek as non-standard.
    compat: { supportsMidConvoSystemMessages: true },
    models: [{ id: "deepseek-v4-flash", contextWindow: 1_000_000 }],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    authEnv: "OPENROUTER_KEY",
    compat: OPENAI_COMPATIBLE,
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
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    authEnv: "OPENAI_KEY",
    compat: { supportsMidConvoSystemMessages: true },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    authEnv: "ANTHROPIC_KEY",
    compat: OPENAI_COMPATIBLE,
    headers: { "anthropic-dangerous-direct-browser-access": "true" },
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    authEnv: "GROQ_KEY",
    compat: OPENAI_COMPATIBLE,
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    authEnv: "MISTRAL_KEY",
    compat: { ...OPENAI_COMPATIBLE, maxTokensField: "max_tokens" },
  },
  {
    id: "xai",
    name: "xAI",
    baseUrl: "https://api.x.ai/v1",
    authEnv: "XAI_KEY",
    // pi already detects xAI as non-standard.
    compat: { supportsMidConvoSystemMessages: true },
  },
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);

/** Whether a provider takes a key of the user's. */
export const needsKey = (p: Provider) => !!p.authEnv;

/** The Galaxy proxy picks its own model; every other endpoint is told which. */
export const takesModel = (p: Provider) => p.id !== "galaxy";

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
  baseUrl?: string;
  apiKey?: string;
  /** Configured, probed, or listed here; otherwise pi's catalog or a default decides. */
  contextWindow?: number;
  maxTokens?: number;
  rateLimit: number;
  headers: Record<string, string>;
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
    headers: provider.headers ?? {},
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
