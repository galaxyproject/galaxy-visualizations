import type { Model } from "@earendil-works/pi-ai";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { StreamFn } from "@earendil-works/pi-agent-core";

export interface Endpoint {
  baseUrl: string;
  model: string;
  apiKey?: string;
  contextWindow?: number;
}

/** Requests to a keyless endpoint carry the page's session instead of a bearer token. */
const keyless: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.delete("authorization");
  return fetch(input, { ...init, headers });
};

export function connect(endpoint: Endpoint): {
  model: Model<"openai-completions">;
  streamFn: StreamFn;
} {
  const model: Model<"openai-completions"> = {
    id: endpoint.model,
    name: endpoint.model,
    api: "openai-completions",
    provider: "olit",
    baseUrl: endpoint.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: endpoint.contextWindow ?? 128000,
    maxTokens: 8192,
  };
  const models = createModels();
  models.setProvider(
    createProvider({
      id: "olit",
      name: "Olit",
      baseUrl: endpoint.baseUrl,
      auth: {
        apiKey: {
          name: "Olit",
          resolve: async () => ({ auth: { apiKey: endpoint.apiKey || "none" } }),
        },
      },
      models: [model],
      api: openAICompletionsApi(),
    }),
  );
  const streamFn: StreamFn = (m, context, options) =>
    models.streamSimple(m, context, endpoint.apiKey ? options : { ...options, fetch: keyless });
  return { model, streamFn };
}
