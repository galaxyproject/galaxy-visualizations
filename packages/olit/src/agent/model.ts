import type { Api, Model } from "@earendil-works/pi-ai";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { StreamFn } from "@earendil-works/pi-agent-core";

import type { ProviderApi, Target } from "./providers";
import { retrying, type RetryInfo } from "./retry";

/** pi's own description of the models it knows, by provider: reasoning, window, price. */
const CATALOGS: Record<string, () => Promise<Record<string, Model<Api>>>> = {
  google: () =>
    import("@earendil-works/pi-ai/providers/google.models").then((m) => m.GOOGLE_MODELS),
  deepseek: () =>
    import("@earendil-works/pi-ai/providers/deepseek.models").then((m) => m.DEEPSEEK_MODELS),
  openrouter: () =>
    import("@earendil-works/pi-ai/providers/openrouter.models").then((m) => m.OPENROUTER_MODELS),
  groq: () => import("@earendil-works/pi-ai/providers/groq.models").then((m) => m.GROQ_MODELS),
  xai: () => import("@earendil-works/pi-ai/providers/xai.models").then((m) => m.XAI_MODELS),
};

const APIS: Record<ProviderApi, () => ReturnType<typeof openAICompletionsApi>> = {
  "openai-completions": openAICompletionsApi,
  "google-generative-ai": googleGenerativeAIApi as unknown as () => ReturnType<
    typeof openAICompletionsApi
  >,
};

/** At most `perMinute` requests in any minute, spaced as a token bucket refills. */
function rateLimiter(perMinute: number): () => Promise<void> {
  let tokens = perMinute;
  let last = Date.now();
  let queue = Promise.resolve();
  const refill = () => {
    const now = Date.now();
    tokens = Math.min(perMinute, tokens + ((now - last) / 60000) * perMinute);
    last = now;
  };
  return () =>
    (queue = queue.then(async () => {
      refill();
      while (tokens < 1) {
        await new Promise((resolve) => setTimeout(resolve, ((1 - tokens) / perMinute) * 60000));
        refill();
      }
      tokens -= 1;
    }));
}

/** pi's catalog entry for this model, when pi knows it and reaches it through the same API. */
async function catalogued(provider: string, id: string, api: ProviderApi) {
  const known = await CATALOGS[provider]?.().catch(() => undefined);
  const entry = known ? Object.values(known).find((m) => m.id === id) : undefined;
  return entry?.api === api ? entry : undefined;
}

/**
 * The model and stream for a target, under its real provider id, so pi-ai applies what it
 * knows about that provider: its compat detection, its catalog, and its own adapter.
 */
export async function connect(
  target: Target,
  onRetry?: (info: RetryInfo) => void,
): Promise<{ model: Model<Api>; streamFn: StreamFn }> {
  const provider = target.provider;
  const api = provider.api ?? "openai-completions";
  const known = await catalogued(provider.id, target.model, api);
  const baseUrl = target.baseUrl ?? known?.baseUrl ?? "";
  const model = {
    ...(known ?? {
      name: target.model,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      // Zero leaves max_tokens out of the request, so the endpoint's own default applies.
      maxTokens: 0,
    }),
    id: target.model,
    api,
    provider: provider.id,
    baseUrl,
    contextWindow: target.contextWindow,
    ...(target.maxTokens ? { maxTokens: target.maxTokens } : {}),
    // A keyless endpoint (the Galaxy proxy) authenticates with the page's session instead.
    headers: { ...target.headers, ...(target.apiKey ? {} : { Authorization: null }) },
    compat: { ...(known as { compat?: object } | undefined)?.compat, ...provider.compat },
  } as unknown as Model<Api>;
  const models = createModels();
  models.setProvider(
    createProvider({
      id: provider.id,
      name: provider.name,
      baseUrl,
      auth: {
        apiKey: {
          name: provider.name,
          resolve: async () => ({ auth: { apiKey: target.apiKey || "none" } }),
        },
      },
      models: [model],
      api: APIS[api](),
    }),
  );
  const acquire = rateLimiter(target.rateLimit);
  const streamFn: StreamFn = async (m, context, options) => {
    await acquire();
    if (api !== "openai-completions") {
      // pi's native adapters bring their own transport and retry; they refuse a custom fetch.
      return models.streamSimple(m, context, { maxRetries: 3, ...options } as never);
    }
    const base: typeof fetch =
      (options as { fetch?: typeof fetch } | undefined)?.fetch ??
      ((input, init) => fetch(input, init));
    // pi-ai's retry cannot honour a stated delay and report the wait; this one can.
    return models.streamSimple(m, context, { ...options, fetch: retrying(base, onRetry) } as never);
  };
  return { model, streamFn };
}
