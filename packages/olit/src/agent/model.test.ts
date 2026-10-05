import { describe, expect, it } from "vitest";

import { catalogued, connect, DEFAULT_CONTEXT_WINDOW } from "./model";
import { PROVIDERS, resolve, type LlmConfig } from "./providers";

/** The body and headers a request would carry, read off the real request. */
async function request(config: LlmConfig) {
  const { model, streamFn } = await connect(resolve(config));
  let body: Record<string, unknown> = {};
  let headers = new Headers();
  const stream = await streamFn(
    model,
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
    const { model } = await connect(resolve({ ai_provider: "deepseek", ai_model: "m" }));
    expect(model.provider).toBe("deepseek");
  });

  it("reaches Gemini through pi's own adapter and catalog", async () => {
    const { model } = await connect(
      resolve({ ai_provider: "google", ai_model: "gemini-3.7-flash", ai_api_key: "k" }),
    );
    expect(model.api).toBe("google-generative-ai");
    // Known to pi as a reasoning model, so its thought signatures are kept and replayed.
    expect(model.reasoning).toBe(true);
  });

  it("takes a listed model's window from pi's catalog, where a copy here would drift", async () => {
    const { model } = await connect(
      resolve({ ai_provider: "openrouter", ai_model: "deepseek/deepseek-v4-flash-0731" }),
    );
    expect(model.contextWindow).toBe(
      (await catalogued("openrouter", "deepseek/deepseek-v4-flash-0731"))!.contextWindow,
    );
  });

  it("lets a configured window override pi's, and falls back when nobody knows", async () => {
    const configured = await connect(
      resolve({ ai_provider: "google", ai_model: "gemini-3.7-flash", ai_context_window: 4096 }),
    );
    expect(configured.model.contextWindow).toBe(4096);
    const unknown = await connect(resolve({ ai_provider: "openai", ai_model: "unlisted" }));
    expect(unknown.model.contextWindow).toBe(DEFAULT_CONTEXT_WINDOW);
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

  it("leaves out `store` for the OpenAI-compatible endpoints that never defined it", async () => {
    for (const provider of ["jetstream2", "openrouter", "ollama", "deepseek", "groq", "mistral"]) {
      expect(await body(provider), provider).not.toHaveProperty("store");
    }
  });

  it("still sends `store: false` to OpenAI, which keeps completions otherwise", async () => {
    expect(await body("openai")).toHaveProperty("store", false);
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
