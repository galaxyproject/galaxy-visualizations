import type { Model } from "@earendil-works/pi-ai";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { StreamFn } from "@earendil-works/pi-agent-core";

import type { Target } from "./providers";
import { retrying, type RetryInfo } from "./retry";

/** Requests to a keyless endpoint carry the page's session instead of a bearer token. */
const keyless: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.delete("authorization");
  return fetch(input, { ...init, headers });
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

export function connect(
  target: Target,
  onRetry?: (info: RetryInfo) => void,
): {
  model: Model<"openai-completions">;
  streamFn: StreamFn;
} {
  const baseUrl = target.baseUrl ?? "";
  const model: Model<"openai-completions"> = {
    id: target.model,
    name: target.model,
    api: "openai-completions",
    provider: "olit",
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: target.contextWindow,
    // Zero leaves max_tokens out of the request, so the endpoint's own default applies.
    maxTokens: target.maxTokens ?? 0,
    headers: target.headers,
    compat: { maxTokensField: "max_tokens", supportsMidConvoSystemMessages: true },
  };
  const models = createModels();
  models.setProvider(
    createProvider({
      id: "olit",
      name: target.provider.name,
      baseUrl,
      auth: {
        apiKey: {
          name: target.provider.name,
          resolve: async () => ({ auth: { apiKey: target.apiKey || "none" } }),
        },
      },
      models: [model],
      api: openAICompletionsApi(),
    }),
  );
  const acquire = rateLimiter(target.rateLimit);
  // pi-ai's own retry is off by default and cannot say it is waiting; this one can.
  const send = retrying(target.apiKey ? (input, init) => fetch(input, init) : keyless, onRetry);
  const streamFn: StreamFn = async (m, context, options) => {
    await acquire();
    return models.streamSimple(m, context, { ...options, fetch: send });
  };
  return { model, streamFn };
}
