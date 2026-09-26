import { describe, expect, it } from "vitest";

import { historyFromResult, recordPageFromResult } from "./working-history";

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

describe("recordPageFromResult", () => {
  it("learns the page a record call answered with", () => {
    const content = JSON.stringify({
      created: true,
      page_id: "p9",
      title: "Olit Notebook (4f2a9c1b)",
    });
    expect(recordPageFromResult("notebook_resume", content)).toBe("p9");
  });

  it("ignores a page id mentioned by any other tool", () => {
    // Only the record call speaks for the record; update_page reports one too.
    const content = JSON.stringify({ page_id: "someone-elses" });
    expect(recordPageFromResult("update_page", content)).toBeUndefined();
  });

  it("survives a result that is not JSON", () => {
    expect(recordPageFromResult("notebook_resume", "Refused: no")).toBeUndefined();
  });

  it("survives a result with no page id", () => {
    expect(
      recordPageFromResult("notebook_resume", JSON.stringify({ error: "boom" })),
    ).toBeUndefined();
  });
});
