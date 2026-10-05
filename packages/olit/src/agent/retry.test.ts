import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ATTEMPTS,
  MAX_RETRY_AFTER_S,
  RETRY_INFO_TYPE,
  retryAfter,
  retrying,
  type RetryInfo,
} from "./retry";

const GEMINI_429 = JSON.stringify([
  {
    error: {
      code: 429,
      message: "You exceeded your current quota",
      details: [
        { "@type": "type.googleapis.com/google.rpc.Help", links: [] },
        { "@type": RETRY_INFO_TYPE, retryDelay: "14s" },
      ],
    },
  },
]);

const headers = (h: Record<string, string> = {}) => new Headers(h);

describe("retryAfter", () => {
  it("reads the standard header, whatever its casing", () => {
    expect(retryAfter(headers({ "Retry-After": "30" }), "")).toBe(30);
    expect(retryAfter(headers({ "RETRY-AFTER": "30" }), "")).toBe(30);
  });

  it("understands the HTTP-date form", () => {
    const soon = new Date(Date.now() + 20000).toUTCString();
    const got = retryAfter(headers({ "Retry-After": soon }), "")!;
    expect(got).toBeGreaterThanOrEqual(15);
    expect(got).toBeLessThanOrEqual(25);
  });

  it("understands OpenAI's millisecond header", () => {
    expect(retryAfter(headers({ "retry-after-ms": "2500" }), "")).toBe(2.5);
  });

  it("prefers the standard header over the provider-specific body", () => {
    expect(retryAfter(headers({ "Retry-After": "3" }), GEMINI_429)).toBe(3);
  });

  it("reads Google's RetryInfo from the body, where Gemini states it", () => {
    expect(retryAfter(headers(), GEMINI_429)).toBe(14);
  });

  it("is undefined when nothing is stated, so the caller backs off itself", () => {
    expect(retryAfter(headers(), "")).toBeUndefined();
    expect(retryAfter(headers(), "not json")).toBeUndefined();
    expect(retryAfter(headers(), JSON.stringify([{ error: { details: [] } }]))).toBeUndefined();
  });

  it("caps a wild delay so it cannot hang the turn", () => {
    expect(retryAfter(headers({ "Retry-After": "99999" }), "")).toBe(MAX_RETRY_AFTER_S);
  });

  it("falls through a malformed header rather than raising", () => {
    expect(retryAfter(headers({ "Retry-After": "soon" }), GEMINI_429)).toBe(14);
    expect(retryAfter(headers({ "Retry-After": "soon" }), "")).toBeUndefined();
  });
});

describe("retrying", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A transport that answers `status` for `failures` attempts, then 200. */
  function transport(status: number, failures = 99, init: ResponseInit = {}) {
    const calls: number[] = [];
    const send = (async () => {
      calls.push(calls.length);
      return calls.length <= failures
        ? new Response(init.statusText ?? "boom", { status, headers: init.headers })
        : new Response("{}", { status: 200 });
    }) as typeof fetch;
    return { send, calls };
  }

  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();
    return promise;
  }

  it("resends a rate-limited request and reports the stated wait", async () => {
    const { send, calls } = transport(429, 1, { headers: { "Retry-After": "6" } });
    const seen: RetryInfo[] = [];
    const response = await settle(
      retrying(send, (i) => seen.push(i))("http://llm", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(seen).toEqual([{ status: 429, wait: 6, attempt: 1, of: ATTEMPTS }]);
  });

  it("resends a server error, since a failed completion produced nothing", async () => {
    const { send, calls } = transport(503, 1);
    expect((await settle(retrying(send)("http://llm", { method: "POST" }))).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("never resends a client error", async () => {
    const { send, calls } = transport(400);
    expect((await settle(retrying(send)("http://llm"))).status).toBe(400);
    expect(calls).toHaveLength(1);
  });

  it("caps the attempts and hands back the last refusal", async () => {
    const { send, calls } = transport(503);
    expect((await settle(retrying(send)("http://llm"))).status).toBe(503);
    expect(calls).toHaveLength(ATTEMPTS);
  });

  it("stops waiting when the turn is aborted", async () => {
    const { send, calls } = transport(429, 99, { headers: { "Retry-After": "30" } });
    const controller = new AbortController();
    const pending = retrying(send)("http://llm", { signal: controller.signal });
    const outcome = expect(pending).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await outcome;
    expect(calls).toHaveLength(1);
  });

  it("survives a listener that throws", async () => {
    const { send } = transport(429, 1);
    const response = await settle(
      retrying(send, () => {
        throw new Error("listener");
      })("http://llm"),
    );
    expect(response.status).toBe(200);
  });
});
