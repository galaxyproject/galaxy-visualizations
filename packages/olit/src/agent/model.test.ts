import { describe, expect, it } from "vitest";

import { connect } from "./model";
import { resolve, type LlmConfig } from "./providers";

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
