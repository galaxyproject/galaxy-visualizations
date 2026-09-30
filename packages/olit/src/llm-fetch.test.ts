import { describe, expect, it, vi } from "vitest";

// @ts-expect-error plain JS shared with the worker, which cannot import TypeScript
import { authorizedFetch } from "./pyodide/llm-fetch.js";

const LLM = { baseUrl: "https://llm.example/v1", apiKey: "sk-secret" };

function capture() {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: true };
  });
  return { impl, calls };
}

describe("authorizedFetch", () => {
  it("signs a request to the model endpoint", async () => {
    const { impl, calls } = capture();
    await authorizedFetch(impl, LLM)("https://llm.example/v1/chat/completions", { method: "POST" });
    expect(calls[0].init.headers.Authorization).toBe("Bearer sk-secret");
    expect(calls[0].init.method).toBe("POST");
  });

  it("leaves every other request alone", async () => {
    const { impl, calls } = capture();
    const init = { method: "GET", headers: { "x-api-key": "galaxy" } };
    await authorizedFetch(impl, LLM)("/api/histories", init);
    expect(calls[0].init).toBe(init);
  });

  it("keeps the headers the brain set beside the one it adds", async () => {
    const { impl, calls } = capture();
    const headers = new Map([["Content-Type", "application/json"]]);
    await authorizedFetch(impl, LLM)(
      "https://llm.example/v1/chat/completions",
      new Map([["headers", headers]]),
    );
    expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
    expect(calls[0].init.headers.Authorization).toBe("Bearer sk-secret");
  });

  it("is plain fetch when there is no key to add", () => {
    const { impl } = capture();
    expect(authorizedFetch(impl, { baseUrl: "https://llm.example/v1" })).toBe(impl);
    expect(authorizedFetch(impl, undefined)).toBe(impl);
  });
  it.each([
    ["a sibling host the base is a prefix of", "https://llm.example.evil.test/v1/chat/completions"],
    ["a path outside the configured base", "https://llm.example/internal/metrics"],
    ["a path the base only prefixes as text", "https://llm.example/v1beta/chat"],
    ["http where the base is https", "http://llm.example/v1/chat/completions"],
    ["another port on the same host", "https://llm.example:8443/v1/chat/completions"],
  ])("does not sign %s", async (_name, url) => {
    const { impl, calls } = capture();
    const init = { method: "POST" };
    await authorizedFetch(impl, LLM)(url, init);
    expect(calls[0].init).toBe(init);
  });

  it("signs the base path itself and anything under it", async () => {
    const { impl, calls } = capture();
    await authorizedFetch(impl, LLM)("https://llm.example/v1", {});
    await authorizedFetch(impl, LLM)("https://llm.example/v1/models", {});
    expect(calls.map((c) => c.init.headers.Authorization)).toEqual([
      "Bearer sk-secret",
      "Bearer sk-secret",
    ]);
  });

  it("treats a base with no path as the whole origin", async () => {
    const { impl, calls } = capture();
    const llm = { baseUrl: "https://my-llm.company.ai", apiKey: "sk-secret" };
    await authorizedFetch(impl, llm)("https://my-llm.company.ai/v1/chat", {});
    expect(calls[0].init.headers.Authorization).toBe("Bearer sk-secret");
    const init = { method: "POST" };
    await authorizedFetch(impl, llm)("https://my-llm.company.ai.evil.test/v1/chat", init);
    expect(calls[1].init).toBe(init);
  });
});
