import { describe, expect, it } from "vitest";

import { catalogued, connect, DEFAULT_CONTEXT_WINDOW, keyVariable } from "./model";
import { piProvider, providerById, PROVIDERS, resolve, type LlmConfig } from "./providers";

/** The model a connection serves, as pi-ai resolves it. */
async function modelOf(config: LlmConfig) {
  const { models, model } = await connect(resolve(config));
  return models.getModel(model.provider as never, model.modelId)!;
}

/** The body and headers a request would carry, read off the real request. */
async function request(config: LlmConfig) {
  const { models, model } = await connect(resolve(config));
  let body: Record<string, unknown> = {};
  let headers = new Headers();
  const stream = models.streamSimple(
    models.getModel(model.provider as never, model.modelId)!,
    { messages: [{ role: "user", content: "hi", timestamp: 0 }] } as never,
    {
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        headers = new Headers(init?.headers);
        return new Response("data: [DONE]\n\n", {
          headers: { "content-type": "text/event-stream" },
        });
      },
      onPayload: (payload: unknown) => {
        body = payload as Record<string, unknown>;
      },
    } as never,
  );
  await stream.result();
  return { body, headers };
}

const body = async (provider: string) =>
  (await request({ ai_provider: provider, ai_model: "m", ai_api_key: "k" })).body;

describe("connect", () => {
  it("names the model by its real provider, so pi applies what it knows of it", async () => {
    const model = await modelOf({ ai_provider: "deepseek", ai_model: "m" });
    expect(model.provider).toBe("deepseek");
  });

  it("reaches Gemini through pi's own adapter and catalog", async () => {
    const model = await modelOf({
      ai_provider: "google",
      ai_model: "gemini-3.7-flash",
      ai_api_key: "k",
    });
    expect(model.api).toBe("google-generative-ai");
    // Known to pi as a reasoning model, so its thought signatures are kept and replayed.
    expect(model.reasoning).toBe(true);
  });

  it("takes a listed model's window from pi's catalog, where a copy here would drift", async () => {
    const model = await modelOf({
      ai_provider: "openrouter",
      ai_model: "deepseek/deepseek-v4-flash-0731",
    });
    expect(model.contextWindow).toBe(
      (await catalogued("openrouter", "deepseek/deepseek-v4-flash-0731"))!.contextWindow,
    );
  });

  it("lets a configured window override pi's, and falls back when nobody knows", async () => {
    const configured = await modelOf({
      ai_provider: "google",
      ai_model: "gemini-3.7-flash",
      ai_context_window: 4096,
    });
    expect(configured.contextWindow).toBe(4096);
    const unknown = await modelOf({ ai_provider: "openai", ai_model: "unlisted" });
    expect(unknown.contextWindow).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it("lists a window only for a model pi's catalog does not know", async () => {
    for (const provider of PROVIDERS) {
      for (const m of provider.models ?? []) {
        const known = await catalogued(provider.id, m.id);
        expect(!!known && m.contextWindow !== undefined, `${provider.id} ${m.id}`).toBe(false);
      }
    }
  });

  it("asks an OpenAI-compatible endpoint for no output ceiling unless one is configured", async () => {
    // pi's catalog lists 65536 for this model; OpenRouter reserves credit against what is asked.
    const unset = await request({
      ai_provider: "openrouter",
      ai_model: "google/gemini-3.1-flash-lite",
      ai_api_key: "k",
    });
    expect(unset.body).not.toHaveProperty("max_tokens");
    expect(unset.body).not.toHaveProperty("max_completion_tokens");
    const set = await request({
      ai_provider: "openrouter",
      ai_model: "google/gemini-3.1-flash-lite",
      ai_api_key: "k",
      ai_max_tokens: 512,
    });
    expect(JSON.stringify(set.body)).toContain("512");
  });

  it("leaves out `store` for the endpoints Olit defines, which never defined it", async () => {
    for (const provider of ["jetstream2", "ollama"]) {
      expect(await body(provider), provider).not.toHaveProperty("store");
    }
  });

  it("reaches a provider pi defines through pi's own API, with nothing of Olit's on top", async () => {
    const reached = async (provider: string, model: string) =>
      modelOf({ ai_provider: provider, ai_model: model, ai_api_key: "k" });
    expect((await reached("openai", "gpt-unlisted")).api).toBe("openai-responses");
    expect((await reached("anthropic", "claude-unlisted")).api).toBe("anthropic-messages");
    expect((await reached("mistral", "mistral-unlisted")).api).toBe("mistral-conversations");
    // OpenRouter lists Anthropic models under Anthropic's API, but serves the rest OpenAI's way.
    expect((await reached("openrouter", "some/unlisted")).api).toBe("openai-completions");
    const deepseek = await reached("deepseek", "deepseek-v4-flash");
    expect(deepseek.baseUrl).toBe((await piProvider("deepseek"))!.baseUrl);
  });

  it("reads a key from pi's own variable for a provider pi defines", async () => {
    const { apiKey } = await connect(resolve({ ai_provider: "groq", ai_model: "m" }), {
      GROQ_API_KEY: "gsk-from-env",
    });
    expect(apiKey).toBe("gsk-from-env");
  });

  it("names the variable a harness puts each key in, Olit's or pi's", async () => {
    expect(await keyVariable(providerById("jetstream2")!)).toBe("JETSTREAM2_KEY");
    expect(await keyVariable(providerById("google")!)).toBe("GEMINI_API_KEY");
    expect(await keyVariable(providerById("anthropic")!)).toBe("ANTHROPIC_API_KEY");
  });

  it("sends no bearer token to a keyless endpoint, which reads the page's session", async () => {
    const { headers } = await request({ ai_provider: "galaxy", ai_base_url: "http://g/v1" });
    expect(headers.has("authorization")).toBe(false);
  });

  it("sends the key to an endpoint that takes one", async () => {
    const { headers } = await request({ ai_provider: "openrouter", ai_api_key: "sk-or" });
    expect(headers.get("authorization")).toBe("Bearer sk-or");
  });
});
