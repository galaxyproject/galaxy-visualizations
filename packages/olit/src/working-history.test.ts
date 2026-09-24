import { describe, expect, it } from "vitest";

import { historyFromResult } from "./working-history";

const result = (payload: unknown) => JSON.stringify(payload);

describe("the history a session ends up working in", () => {
  it("is the one a created history names as its own id", () => {
    const created = result({ model_class: "History", id: "h1", name: "GTN tutorial" });
    expect(historyFromResult("create_history", created)).toBe("h1");
  });

  it("is the one an invocation says it ran in", () => {
    expect(historyFromResult("invoke_workflow", result({ id: "i1", history_id: "h2" }))).toBe("h2");
  });

  it("is the one an upload's outputs landed in", () => {
    const uploaded = result({
      outputs: [{ id: "d1", history_id: "h3" }],
      jobs: [{ id: "j1", history_id: "h3" }],
    });
    expect(historyFromResult("upload_file_from_url", uploaded)).toBe("h3");
  });

  it("is not guessed from a result that names no history", () => {
    expect(historyFromResult("search_tools_by_name", result(["Filter1"]))).toBeUndefined();
    expect(historyFromResult("gtn_search", result({ count: 35, topics: [] }))).toBeUndefined();
  });

  it("survives a result that is not json at all", () => {
    expect(historyFromResult("run_python", "Tool call was not executed")).toBeUndefined();
  });

  it("does not mistake a listed history for the one being worked in", () => {
    const listed = result({
      items: [{ model_class: "History", id: "other", name: "Unnamed history" }],
    });
    expect(historyFromResult("get_histories", listed)).toBeUndefined();
  });
});
