import { afterEach, describe, expect, it, vi } from "vitest";

import { connectGalaxy, segment } from "./galaxy";

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
