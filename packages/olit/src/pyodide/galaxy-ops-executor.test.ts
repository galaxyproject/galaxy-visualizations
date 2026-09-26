import { describe, it, expect, vi } from "vitest";
// @ts-expect-error -- plain JS module, loaded by the worker rather than the app bundle
import * as executor from "./galaxy-ops-executor.js";

const { __galaxyFetchForTest: galaxyFetch, noSuchOperation, unexpectedFailure } = executor;

/** The request that reached fetch, however the caller handed it over. */
async function sent(target: Request | string, options?: RequestInit) {
  const spy = vi.fn(
    async (_target: Request | string, _options?: RequestInit) => new Response("{}"),
  );
  vi.stubGlobal("fetch", spy as unknown as typeof fetch);
  await (galaxyFetch("include") as (t: Request | string, o?: RequestInit) => Promise<Response>)(
    target,
    options,
  );
  return spy.mock.calls[0][0] as Request;
}

const form = "application/x-www-form-urlencoded";

describe("the galaxy fetch olit hands galaxy-ops", () => {
  it("keeps the method, body and content type of a Request the client builds itself", async () => {
    // A live run found this: the client calls fetchImpl with one Request, so an init assembled
    // here replaced its headers. create_history posts form-encoded, and Galaxy read no name.
    const got = await sent(
      new Request("http://galaxy.invalid/api/histories", {
        method: "POST",
        headers: { "content-type": form, "x-api-key": "secret" },
        body: "name=probe",
      }),
    );
    expect(got.method).toBe("POST");
    expect(got.headers.get("content-type")).toBe(form);
    expect(await got.text()).toBe("name=probe");
    expect(got.url).toBe("http://galaxy.invalid/api/histories");
  });

  it("drops the api key, because the browser session is the credential", async () => {
    const got = await sent(
      new Request("http://galaxy.invalid/api/histories", { headers: { "x-api-key": "secret" } }),
    );
    expect(got.headers.has("x-api-key")).toBe(false);
  });

  it("still accepts a url and an init, and keeps the headers given that way", async () => {
    const got = await sent("http://galaxy.invalid/api/histories", {
      method: "POST",
      headers: { "content-type": form, "x-api-key": "secret" },
      body: "name=probe",
    });
    expect(got.headers.get("content-type")).toBe(form);
    expect(got.headers.has("x-api-key")).toBe(false);
    expect(await got.text()).toBe("name=probe");
  });

  it("sends the session along", async () => {
    expect((await sent(new Request("http://galaxy.invalid/api/version"))).credentials).toBe(
      "include",
    );
  });
});

describe("the failures an executor answers with itself", () => {
  // The node driver the brain uses off the browser states these identically; a Python test
  // pins the same wording there, so the two cannot drift apart unnoticed.
  it("names an operation this build does not have", () => {
    expect(noSuchOperation("nope")).toEqual({
      success: false,
      errorKind: "not_found",
      message: "galaxy-ops has no operation named 'nope'",
    });
  });

  it("reports a non-Galaxy error as an envelope rather than letting it cross the boundary", () => {
    expect(unexpectedFailure(new Error("boom"))).toEqual({
      success: false,
      errorKind: "unexpected",
      message: "boom",
    });
  });

  it("reports a thrown non-error too", () => {
    expect(unexpectedFailure("plain string").message).toBe("plain string");
  });
});
