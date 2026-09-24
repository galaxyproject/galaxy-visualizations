import { describe, expect, it, vi } from "vitest";

import { providerById } from "./credentials";
import { discoverModels, discoveryError, modelIds, modelsUrl } from "./model-discovery";

const OPENAI = providerById("openai")!;
const ANTHROPIC = providerById("anthropic")!;

function answer(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, json: async () => body }) as unknown as Response);
}

describe("model discovery", () => {
  it("hangs the list off the base URL without doubling the slash", () => {
    expect(modelsUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/models");
    expect(modelsUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/models");
  });

  it("reads ids out of an OpenAI-shaped body", async () => {
    const fetchImpl = answer({ data: [{ id: "b" }, { id: "a" }] });
    const out = await discoverModels(fetchImpl as never, OPENAI, "https://api.openai.com/v1", "k");
    expect(out.models).toEqual(["a", "b"]);
    expect(out.error).toBeUndefined();
  });

  it("sends the key and whatever else the provider needs to be reachable", async () => {
    const fetchImpl = answer({ data: [] });
    await discoverModels(fetchImpl as never, ANTHROPIC, "https://api.anthropic.com/v1", "k");
    const headers = (fetchImpl.mock.calls[0] as never[])[1] as { headers: Record<string, string> };
    expect(headers.headers.Authorization).toBe("Bearer k");
    // Without this Anthropic sends no CORS header and the browser blocks the reply.
    expect(headers.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("ignores entries that carry no id rather than listing undefined", () => {
    expect(modelIds({ data: [{ id: "a" }, {}, { id: 7 }, { id: "a" }] })).toEqual(["a"]);
  });

  it("treats a body of the wrong shape as no models", () => {
    expect(modelIds({ models: ["a"] })).toEqual([]);
    expect(modelIds(null)).toEqual([]);
  });

  it("names a rejected key, because every turn would be rejected too", () => {
    expect(discoveryError(401)).toMatch(/rejected that key/i);
    expect(discoveryError(403)).toMatch(/rejected that key/i);
  });

  it("says to type the name when an endpoint serves no list", () => {
    expect(discoveryError(404)).toMatch(/type the model name/i);
  });

  it("reports a blocked request rather than throwing into the dialog", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const out = await discoverModels(fetchImpl as never, OPENAI, "https://api.openai.com/v1", "k");
    expect(out.models).toEqual([]);
    expect(out.error).toMatch(/could not reach/i);
  });

  it("reports an HTTP failure without inventing models", async () => {
    const out = await discoverModels(answer({}, false, 500) as never, OPENAI, "https://x/v1", "k");
    expect(out).toEqual({ models: [], error: "The endpoint answered 500." });
  });
});
