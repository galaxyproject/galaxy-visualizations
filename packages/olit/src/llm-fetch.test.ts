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
});
