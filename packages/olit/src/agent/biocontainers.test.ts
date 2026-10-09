import { describe, expect, it } from "vitest";

import { parsePackages, pickTag, recommend } from "./biocontainers";

const CONTRACT = ["found", "image", "match_quality", "notes", "source", "verified"];
const QUALITIES = ["exact_version", "name_only", "not_found"];

const tag = (name: string, start_ts: number) => ({ name, start_ts });

function quay(tags: unknown[] = [], status = 200) {
  const urls: string[] = [];
  const headers: Headers[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    urls.push(url);
    headers.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ tags }), { status });
  }) as unknown as typeof fetch;
  return { urls, headers, fetchImpl };
}

describe("parsePackages", () => {
  it("parses a bare name and a pinned version", () => {
    expect(parsePackages(["pandas", "samtools=1.17"])).toEqual([
      ["pandas", null],
      ["samtools", "1.17"],
    ]);
  });

  it("refuses an empty list", () => {
    expect(() => parsePackages([])).toThrow(/at least one/);
  });

  it("refuses an entry without a name", () => {
    expect(() => parsePackages(["=1.17"])).toThrow(/invalid package entry/);
  });
});

describe("pickTag", () => {
  it("matches a pinned version with its build suffix", () => {
    const tags = [tag("2.2.1", 10), tag("2.2.1--pyhd8ed1ab_1", 20), tag("1.5.2", 5)];
    expect(pickTag(tags, "2.2.1")).toEqual(["2.2.1--pyhd8ed1ab_1", "exact_version"]);
  });

  it("resolves a pinned version with no built tag to nothing, not the newest", () => {
    expect(pickTag([tag("1.5.2", 5), tag("2.2.1", 30)], "9.9.9")).toEqual([null, "not_found"]);
  });

  it("takes the newest built tag when no version is pinned", () => {
    expect(pickTag([tag("1.5.2", 5), tag("2.2.1", 30)], null)).toEqual(["2.2.1", "name_only"]);
  });

  it("chooses the newest by timestamp, not by position", () => {
    expect(pickTag([tag("old", 99), tag("newer", 100)], null)[0]).toBe("newer");
  });

  it("resolves an empty listing to nothing", () => {
    expect(pickTag([], "1.0")).toEqual([null, "not_found"]);
  });

  it("takes the highest version, not the most recent build", () => {
    const tags = [tag("0.23.4--py36hf8a1672_0", 1719914447), tag("2.2.1", 1716355000)];
    expect(pickTag(tags, null)).toEqual(["2.2.1", "name_only"]);
  });

  it("orders builds of one version by build time", () => {
    const tags = [tag("1.17--hd87286a_1", 10), tag("1.17--hd87286a_2", 20)];
    expect(pickTag(tags, "1.17")).toEqual(["1.17--hd87286a_2", "exact_version"]);
  });

  it("never ranks a tag without a leading version above one with", () => {
    expect(pickTag([tag("latest", 999), tag("1.0", 1)], null)[0]).toBe("1.0");
  });
});

describe("recommend", () => {
  it("reports the tag the registry serves", async () => {
    const { fetchImpl } = quay([tag("2.2.1--pyhd8ed1ab_1", 20)]);
    const out = await recommend(["pandas=2.2.1"], fetchImpl);
    expect(Object.keys(out).sort()).toEqual(CONTRACT);
    expect(out.image).toBe("quay.io/biocontainers/pandas:2.2.1--pyhd8ed1ab_1");
    expect(out.found).toBe(true);
    expect(out.verified).toBe(true);
    expect(out.match_quality).toBe("exact_version");
    expect(out.notes).toEqual([]);
  });

  it("reports a pinned version that is not built instead of substituting the newest", async () => {
    const out = await recommend(["pandas=9.9.9"], quay([tag("2.2.1", 20)]).fetchImpl);
    expect(out.found).toBe(false);
    expect(out.image).toBeNull();
    expect(out.match_quality).toBe("not_found");
    expect(out.verified).toBe(false);
    expect(out.notes[0]).toContain("'pandas' version '9.9.9'");
  });

  it("asks quay.io for the pinned version's tags, so one past the first page is found", async () => {
    const fake = quay([tag("1.2--1", 5)]);
    const out = await recommend(["samtools=1.2"], fake.fetchImpl);
    expect(new URL(fake.urls[0]).searchParams.get("filter_tag_name")).toBe("like:1.2");
    expect(out.image).toMatch(/samtools:1\.2--1$/);
  });

  it("says it is an XMLHttpRequest, which quay.io requires of a browser's API call", async () => {
    const fake = quay([tag("3.1.1", 5)]);
    await recommend(["plotly"], fake.fetchImpl);
    expect(fake.headers[0].get("X-Requested-With")).toBe("XMLHttpRequest");
  });

  it("lists every tag when no version is pinned", async () => {
    const fake = quay([tag("1.2--1", 5)]);
    await recommend(["samtools"], fake.fetchImpl);
    expect(new URL(fake.urls[0]).searchParams.has("filter_tag_name")).toBe(false);
  });

  it("answers not found for several packages instead of guessing a mulled hash", async () => {
    const fake = quay([tag("1.0", 1)]);
    const out = await recommend(["samtools=1.17", "bwa"], fake.fetchImpl);
    expect(out.found).toBe(false);
    expect(out.image).toBeNull();
    expect(out.match_quality).toBe("not_found");
    expect(out.notes[0]).toContain("mulled-v2");
    expect(out.notes[0]).not.toMatch(/MCP/);
    expect(fake.urls).toEqual([]);
  });

  it("reports an unknown package rather than inventing one", async () => {
    const out = await recommend(["nosuchpackage"], quay([], 404).fetchImpl);
    expect(out.found).toBe(false);
    expect(out.image).toBeNull();
    expect(out.verified).toBeNull();
  });

  it("uses only qualities galaxy-mcp declares", async () => {
    const { fetchImpl } = quay([tag("1.0", 1)]);
    for (const packages of [["pandas"], ["pandas=1.0"], ["a", "b"]]) {
      const out = await recommend(packages, fetchImpl);
      expect(QUALITIES).toContain(out.match_quality);
      expect(Object.keys(out).sort()).toEqual(CONTRACT);
    }
  });

  it("escapes the package name into the url", async () => {
    const fake = quay([tag("1.0", 1)]);
    await recommend(["r-ggplot2"], fake.fetchImpl);
    expect(fake.urls[0]).toContain("biocontainers/r-ggplot2/tag/");
  });

  it("resolves to nothing when the registry refuses", async () => {
    const refusing = (async () => {
      throw new Error("HTTP 401: UNAUTHORIZED");
    }) as unknown as typeof fetch;
    const out = await recommend(["nosuchpackage"], refusing);
    expect(out.found).toBe(false);
    expect(out.image).toBeNull();
    expect(out.verified).toBeNull();
    expect(out.notes[0]).toContain("did not answer");
  });
});
