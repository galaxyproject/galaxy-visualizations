import {
  InMemoryCredentialStore,
  type Api,
  type AuthContext,
  type Model,
  type Provider as PiProvider,
} from "@earendil-works/pi-ai";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { StreamFn } from "@earendil-works/pi-agent-core";

import { piProvider, type Provider, type Target } from "./providers";
import { retrying, type RetryInfo } from "./retry";

/** The output ceiling for a model a native adapter reaches but pi's catalog does not list. */
const DEFAULT_NATIVE_MAX_TOKENS = 8192;
/** The window of a model nobody configured and pi's catalog does not list. */
export const DEFAULT_CONTEXT_WINDOW = 128000;

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

/** pi's catalog entry for this model, whichever API pi itself would reach it through. */
export async function catalogued(provider: string, id: string) {
  return (await piProvider(provider))?.getModels().find((m) => m.id === id);
}

/**
 * A model pi's catalog does not list, reached through the provider's OpenAI-compatible API when
 * it has one (OpenRouter serves most models there), else through the API its models use.
 */
function unlisted(id: string, provider: PiProvider<Api>): Model<Api> {
  const listed = provider.getModels();
  const api = listed.some((m) => m.api === "openai-completions")
    ? "openai-completions"
    : (listed[0]?.api ?? "openai-completions");
  const like = listed.find((m) => m.api === api);
  return {
    id,
    name: id,
    api,
    provider: provider.id,
    baseUrl: like?.baseUrl ?? provider.baseUrl ?? "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_NATIVE_MAX_TOKENS,
  } as Model<Api>;
}

/**
 * The variable a headless run puts this provider's key in: Olit's own for a provider it
 * defines, else the API-key variable pi reads, learned by asking pi rather than copied.
 */
export async function keyVariable(provider: Provider): Promise<string | undefined> {
  const pi = await piProvider(provider.id);
  if (!pi) {
    return provider.authEnv;
  }
  const asked: string[] = [];
  const models = createModels({
    authContext: { env: async (name) => void asked.push(name), fileExists: async () => false },
  });
  models.setProvider(pi);
  await models.getAuth(provider.id).catch(() => undefined);
  return asked.find((name) => name.endsWith("_API_KEY")) ?? asked[0];
}

/** The environment a headless run reads keys from; a browser has none. */
const authContext = (env: Record<string, string | undefined>): AuthContext => ({
  env: async (name) => env[name],
  fileExists: async () => false,
});

/**
 * The model and stream for a target. A provider pi defines is pi's own: its endpoint, wire API,
 * compat, catalog and key variable, with the user's key handed over as a stored credential.
 * A provider Olit defines is described to pi under its real id, so pi applies what it can.
 */
export async function connect(
  target: Target,
  onRetry?: (info: RetryInfo) => void,
  env: Record<string, string | undefined> = {},
): Promise<{ model: Model<Api>; streamFn: StreamFn; apiKey?: string }> {
  const provider = target.provider;
  const pi = await piProvider(provider.id);
  const credentials = new InMemoryCredentialStore();
  const store = (key: string) =>
    credentials.modify(provider.id, async () => ({ type: "api_key", key }));
  if (target.apiKey) {
    await store(target.apiKey);
  }
  const models = createModels({ credentials, authContext: authContext(env) });
  let model: Model<Api>;
  if (pi) {
    const known = pi.getModels().find((m) => m.id === target.model);
    const base = known ?? unlisted(target.model, pi);
    model = {
      ...base,
      baseUrl: target.baseUrl ?? base.baseUrl,
      contextWindow: target.contextWindow ?? base.contextWindow,
      maxTokens: ceiling(target, base),
    };
    models.setProvider(pi);
  } else {
    model = {
      id: target.model,
      name: target.model,
      api: "openai-completions",
      provider: provider.id,
      baseUrl: target.baseUrl ?? "",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: target.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
      maxTokens: target.maxTokens || 0,
      // A keyless endpoint (the Galaxy proxy) authenticates with the page's session instead.
      headers: target.apiKey ? {} : { Authorization: null },
      compat: provider.compat,
    } as unknown as Model<Api>;
    models.setProvider(
      createProvider({
        id: provider.id,
        name: provider.name,
        baseUrl: model.baseUrl,
        auth: {
          apiKey: {
            name: provider.name,
            resolve: async () => ({ auth: { apiKey: target.apiKey || "none" } }),
          },
        },
        models: [model],
        api: openAICompletionsApi(),
      }),
    );
  }
  // The key pi will send, wherever it came from, so the session can keep it out of results.
  let resolved = await models.getAuth(model).catch(() => undefined);
  if (!resolved && pi && target.baseUrl) {
    // An endpoint typed or proxied in front of the provider (vite's /llm) brings its own auth.
    await store("none");
    resolved = await models.getAuth(model).catch(() => undefined);
  }
  const apiKey = target.apiKey ?? resolved?.auth.apiKey;
  const acquire = rateLimiter(target.rateLimit);
  const streamFn: StreamFn = async (m, context, options) => {
    await acquire();
    if (m.api !== "openai-completions") {
      // pi's other adapters bring their own transport and retry; they refuse a custom fetch.
      return models.streamSimple(m, context, { maxRetries: 3, ...options } as never);
    }
    const base: typeof fetch =
      (options as { fetch?: typeof fetch } | undefined)?.fetch ??
      ((input, init) => fetch(input, init));
    // pi-ai's retry cannot honour a stated delay and report the wait; this one can.
    return models.streamSimple(m, context, { ...options, fetch: retrying(base, onRetry) } as never);
  };
  return { model, streamFn, apiKey };
}

/**
 * An OpenAI-compatible request gets no output ceiling unless one is configured, so the
 * endpoint's own default applies: OpenRouter reserves credit against whatever is asked. pi's
 * other adapters take the catalog's, as pi sends it.
 */
function ceiling(target: Target, model: Model<Api>): number {
  return target.maxTokens || (model.api === "openai-completions" ? 0 : model.maxTokens);
}
