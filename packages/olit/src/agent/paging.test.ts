import { describe, expect, it } from "vitest";

import { ROW_BYTES_CAP, ROW_CAP, serverPage } from "./paging";

describe("serverPage", () => {
  it("carries the offset to continue from", () => {
    const got = serverPage(Array.from({ length: ROW_CAP + 1 }, (_, i) => ({ i })));
    expect(got.shown).toBe(ROW_CAP);
    expect(got.truncated).toBe(true);
    expect(got.next_offset).toBe(ROW_CAP);
  });

  it("bounds fat rows by bytes, not by count", () => {
    const got = serverPage(Array.from({ length: ROW_CAP }, () => ({ pad: "x".repeat(5000) })));
    expect(got.shown).toBeLessThan(ROW_CAP);
    expect(JSON.stringify(got.items).length).toBeLessThanOrEqual(ROW_BYTES_CAP + 5000);
  });

  it("still returns one oversized row", () => {
    expect(serverPage([{ pad: "x".repeat(ROW_BYTES_CAP * 2) }]).shown).toBe(1);
  });

  it("does not mark a complete page truncated", () => {
    const got = serverPage([{ i: 0 }, { i: 1 }, { i: 2 }]);
    expect(got).not.toHaveProperty("truncated");
    expect(got).not.toHaveProperty("next_offset");
  });
});
