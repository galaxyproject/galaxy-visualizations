import { describe, expect, it } from "vitest";

import { GALAXY_READY, GALAXY_UNAVAILABLE, GALAXY_UNREACHABLE, systemText } from "./agent/prompt";
import { galaxyCanRun, galaxyRefusalMessage } from "./diagnostics";

describe("the approval gate and the prompt, on the same Galaxy state", () => {
  it.each([GALAXY_READY, GALAXY_UNREACHABLE] as const)(
    "refuses exactly when the prompt says nothing can run: %s",
    (status) => {
      const saysNothingCanRun = systemText({ galaxyStatus: status }).includes(GALAXY_UNAVAILABLE);
      expect(galaxyCanRun(status)).toBe(!saysNothingCanRun);
    },
  );

  it("does not block before the agent has reported", () => {
    expect(galaxyCanRun(undefined)).toBe(true);
    expect(galaxyCanRun(null)).toBe(true);
  });

  it("names the server when it refuses", () => {
    expect(galaxyRefusalMessage()).toMatch(/Galaxy did not answer/);
  });
});
