import { afterEach, describe, expect, it, vi } from "vitest";

import { connectGalaxy, galaxyFetch, segment } from "./galaxy";

describe("segment", () => {
  it("keeps an id from adding a segment, a query or a fragment", () => {
    expect(segment("../users/current?x=1#y")).toBe("..%2Fusers%2Fcurrent%3Fx%3D1%23y");
    expect(segment("f2c1a0")).toBe("f2c1a0");
  });

  it("refuses the values a URL reads as this or the parent segment", () => {
    for (const value of ["", ".", "..", "%2e%2e", "%2E.", ".%2e"]) {
      expect(() => segment(value)).toThrow(/is not a Galaxy id/);
    }
  });
});

describe("galaxyFetch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A Galaxy that answers 503 once, then 200, counting what it was sent. */
  function flaky() {
    const methods: string[] = [];
    vi.stubGlobal("fetch", async (request: Request) => {
      methods.push(request.method);
      return methods.length === 1
        ? new Response("busy", { status: 503 })
        : new Response("{}", { status: 200 });
    });
    return methods;
  }

  it("resends a refused read for galaxy-ops' client too, which has no retry of its own", async () => {
    vi.useFakeTimers();
    const methods = flaky();
    const pending = galaxyFetch({ root: "http://galaxy.test/" })("http://galaxy.test/api/version");
    await vi.advanceTimersByTimeAsync(1100);
    expect((await pending).status).toBe(200);
    expect(methods).toEqual(["GET", "GET"]);
  });

  it("never resends a write Galaxy may already have applied", async () => {
    const methods = flaky();
    const response = await galaxyFetch({ root: "http://galaxy.test/" })(
      "http://galaxy.test/api/tools",
      { method: "POST", body: "{}" },
    );
    expect(response.status).toBe(503);
    expect(methods).toEqual(["POST"]);
  });
});

describe("connectGalaxy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("backs off when a refusal states no wait, instead of retrying at once", async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    vi.stubGlobal("fetch", async () => {
      calls.push(Date.now());
      return calls.length === 1
        ? new Response("busy", { status: 503 })
        : new Response("{}", { status: 200 });
    });
    const pending = connectGalaxy({ root: "http://galaxy.test/" }).get("api/version");
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(600);
    await pending;
    expect(calls).toHaveLength(2);
  });
});
