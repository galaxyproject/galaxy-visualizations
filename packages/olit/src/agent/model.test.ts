import { describe, expect, it } from "vitest";

import { connect } from "./model";
import { resolve } from "./providers";

/** The body a request to this provider would carry, read off the real request. */
async function body(provider: string): Promise<Record<string, unknown>> {
  const { model, streamFn } = connect(
    resolve({ ai_provider: provider, ai_model: "m", ai_api_key: "k" }),
  );
  let sent: Record<string, unknown> = {};
  const stream = await streamFn(
    model,
    { messages: [{ role: "user", content: "hi", timestamp: 0 }] } as never,
    {
      fetch: async () =>
        new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }),
      onPayload: (payload: unknown) => {
        sent = payload as Record<string, unknown>;
      },
    } as never,
  );
  await stream.result();
  return sent;
}

describe("connect", () => {
  it("leaves out `store` for Gemini, which rejects the whole request over it", async () => {
    expect(await body("google")).not.toHaveProperty("store");
  });

  it("leaves out `store` for the OpenAI-compatible endpoints that never defined it", async () => {
    for (const provider of ["jetstream2", "openrouter", "ollama", "deepseek"]) {
      expect(await body(provider)).not.toHaveProperty("store");
    }
  });

  it("still sends `store: false` to OpenAI, which keeps completions otherwise", async () => {
    expect(await body("openai")).toHaveProperty("store", false);
  });
});
