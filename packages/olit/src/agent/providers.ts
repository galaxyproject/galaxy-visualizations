const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_RATE_LIMIT = 30;

export interface ProviderModel {
  id: string;
  contextWindow?: number;
}

export interface Provider {
  id: string;
  name: string;
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
  /** The model is typed rather than picked. */
  freeModel?: boolean;
}

export const PROVIDERS: Provider[] = [
  { id: "galaxy", name: "Galaxy chat proxy", maxTokens: 8192 },
  {
    id: "google",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    authEnv: "GEMINI_KEY",
    rateLimit: 5,
    models: [
      { id: "gemini-3.7-flash", contextWindow: 1_000_000 },
      { id: "gemini-3.1-flash-lite", contextWindow: 1_000_000 },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    authEnv: "DEEPSEEK_KEY",
    models: [{ id: "deepseek-v4-flash", contextWindow: 1_000_000 }],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    authEnv: "OPENROUTER_KEY",
    models: [
      { id: "anthropic/claude-sonnet-5", contextWindow: 1_000_000 },
      { id: "openai/gpt-5.6-terra", contextWindow: 1_050_000 },
      { id: "deepseek/deepseek-v4-flash-0731", contextWindow: 1_310_720 },
      { id: "google/gemini-3.7-flash", contextWindow: 1_048_576 },
      { id: "google/gemini-3.1-flash-lite", contextWindow: 1_048_576 },
    ],
  },
  {
    id: "jetstream2",
    name: "Jetstream2",
    baseUrl: "https://llm.jetstream-cloud.org/api",
    authEnv: "JETSTREAM2_KEY",
    models: [
      { id: "gpt-oss-120b", contextWindow: 131_072 },
      { id: "llama-4-scout", contextWindow: 328_000 },
    ],
  },
  {
    id: "ollama",
    name: "Ollama or a local server",
    baseUrl: "http://127.0.0.1:11434/v1",
    probeWindow: true,
    freeModel: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    authEnv: "OPENAI_KEY",
    freeModel: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    authEnv: "ANTHROPIC_KEY",
    freeModel: true,
    headers: { "anthropic-dangerous-direct-browser-access": "true" },
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    authEnv: "GROQ_KEY",
    freeModel: true,
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    authEnv: "MISTRAL_KEY",
    freeModel: true,
  },
  { id: "xai", name: "xAI", baseUrl: "https://api.x.ai/v1", authEnv: "XAI_KEY", freeModel: true },
];

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
  contextWindow: number;
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
    provider = { id: "custom", name: "Custom endpoint", baseUrl: config.ai_base_url };
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
      config.ai_context_window ||
      provider.models?.find((m) => m.id === model)?.contextWindow ||
      DEFAULT_CONTEXT_WINDOW,
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
