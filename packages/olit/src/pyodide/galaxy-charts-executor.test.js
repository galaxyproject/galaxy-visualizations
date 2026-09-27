import { beforeEach, describe, expect, it, vi } from "vitest";

import { install } from "./galaxy-charts-executor";

const TABLE = { columns: ["name", "value"], fields: [["hg38", "hg38.fa"]] };

/** Records every request and answers each one as the data table endpoint would. */
function stubFetch() {
  const seen = [];
  globalThis.fetch = vi.fn(async (url) => {
    seen.push(String(url));
    return { ok: true, json: async () => TABLE };
  });
  return seen;
}

function resolve(input, context = {}) {
  return globalThis.olitGetChartsOptions("get_options", { input, context });
}

describe("the galaxy-charts executor", () => {
  beforeEach(() => {
    delete globalThis.olitGetChartsOptions;
  });

  it("asks the same origin the page was served from", async () => {
    const seen = stubFetch();
    install({ root: "/" });

    const envelope = await resolve({ type: "data_table", tables: ["t_same_origin"] });

    expect(seen).toEqual(["/api/tool_data/t_same_origin"]);
    expect(envelope.success).toBe(true);
    expect(envelope.data).toEqual([
      { label: "hg38", value: expect.objectContaining({ id: "hg38.fa" }) },
    ]);
  });

  it("joins a root that carries no trailing slash", async () => {
    const seen = stubFetch();
    install({ root: "http://galaxy.invalid/galaxy" });

    await resolve({ type: "data_table", tables: ["t_no_slash"] });

    expect(seen).toEqual(["http://galaxy.invalid/galaxy/api/tool_data/t_no_slash"]);
  });

  it("joins a root that carries one", async () => {
    const seen = stubFetch();
    install({ root: "http://galaxy.invalid/galaxy/" });

    await resolve({ type: "data_table", tables: ["t_one_slash"] });

    expect(seen).toEqual(["http://galaxy.invalid/galaxy/api/tool_data/t_one_slash"]);
  });

  it("carries the session cookie, since the page is already authenticated", async () => {
    stubFetch();
    install({ root: "/" });

    await resolve({ type: "data_table", tables: ["t_credentials"] });

    expect(globalThis.fetch.mock.lastCall[1]).toEqual({ credentials: "include" });
  });

  it("refuses a call it does not answer", async () => {
    stubFetch();
    install({ root: "/" });

    const envelope = await globalThis.olitGetChartsOptions("get_datasets", {});

    expect(envelope).toEqual({
      success: false,
      errorKind: "not_found",
      message: "galaxy-charts has no call named 'get_datasets'",
    });
  });

  it("reports a request that could not be read", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ history_id: null }) }));
    install({ root: "/" });

    const envelope = await resolve({ type: "data" }, { datasetId: "d1" });

    expect(envelope.success).toBe(false);
    expect(envelope.errorKind).toBe("unexpected");
    expect(envelope.message).toContain("d1");
  });
});
