process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";

import { galaxyDate, localTime } from "./galaxy-time";

describe("Galaxy timestamps", () => {
  it("reads a zoneless Galaxy time as UTC", () => {
    expect(galaxyDate("2026-10-08T12:34:56.123456").getTime()).toBe(
      Date.UTC(2026, 9, 8, 12, 34, 56, 123),
    );
  });

  it("shows it in the viewer's time", () => {
    expect(localTime("2026-10-08T12:34:56")).toContain("8:34");
  });

  it("leaves a value that does not parse as it is", () => {
    expect(localTime("")).toBe("");
  });
});
