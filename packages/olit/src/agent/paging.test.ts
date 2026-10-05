import { describe, expect, it } from "vitest";

import { ROW_BYTES_CAP, ROW_CAP, serverPage } from "./paging";

describe("serverPage", () => {
  it("says where the next page starts, in galaxy-ops' pagination envelope", () => {
    const got = serverPage(Array.from({ length: ROW_CAP + 1 }, (_, i) => ({ i })));
    expect(got.data).toHaveLength(ROW_CAP);
    expect(got.pagination).toMatchObject({
      returned_items: ROW_CAP,
      has_next: true,
      next_offset: ROW_CAP,
      total_items: null,
    });
  });

  it("bounds fat rows by bytes, not by count", () => {
    const got = serverPage(Array.from({ length: ROW_CAP }, () => ({ pad: "x".repeat(5000) })));
    expect(got.data.length).toBeLessThan(ROW_CAP);
    expect(JSON.stringify(got.data).length).toBeLessThanOrEqual(ROW_BYTES_CAP + 5000);
    expect(got.pagination.has_next).toBe(true);
  });

  it("still returns one oversized row", () => {
    expect(serverPage([{ pad: "x".repeat(ROW_BYTES_CAP * 2) }]).data).toHaveLength(1);
  });

  it("counts the whole set on the last page", () => {
    const got = serverPage([{ i: 0 }, { i: 1 }, { i: 2 }], 4);
    expect(got.pagination).toMatchObject({
      total_items: 7,
      has_next: false,
      next_offset: null,
      has_previous: true,
    });
  });
});
