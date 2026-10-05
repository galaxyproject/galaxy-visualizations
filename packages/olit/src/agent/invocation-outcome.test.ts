import { describe, expect, it } from "vitest";

import { described, settle } from "./invocation-outcome";

const SCHEDULED = { id: "i1", state: "completed", history_id: "h1" };

describe("settle", () => {
  it("fails an invocation with an errored job", () => {
    expect(settle("completed", { error: 1, ok: 1 })).toBe("failed");
    expect(settle("scheduled", { error: 1 })).toBe("failed");
  });

  it("completes a run whose jobs all succeeded", () => {
    expect(settle("scheduled", { ok: 2 })).toBe("completed");
    expect(settle("completed", { ok: 2 })).toBe("completed");
  });

  it("keeps Galaxy's state for a run still working", () => {
    expect(settle("scheduled", { running: 1, ok: 1 })).toBe("scheduled");
    expect(settle("new", {})).toBe("new");
  });

  it("does not judge a run still scheduling", () => {
    expect(settle("new", { ok: 1 })).toBe("new");
    expect(settle("cancelling", { ok: 1 })).toBe("cancelling");
  });

  it("calls an error beside a running job failing rather than failed", () => {
    expect(settle("scheduled", { error: 1, running: 1 })).toBe("failing");
    expect(settle("scheduled", { error: 1, paused: 1 })).toBe("failing");
  });

  it("counts every state loom counts as a failure", () => {
    for (const state of ["error", "failed", "deleted"]) {
      expect(settle("completed", { [state]: 1 })).toBe("failed");
    }
  });

  it("does not count a state that merely ended as a failure", () => {
    expect(settle("scheduled", { ok: 1, skipped: 1 })).toBe("completed");
  });

  it("reports a cancelled run as cancelled", () => {
    expect(settle("cancelled", {})).toBe("cancelled");
    expect(settle("cancelled", { ok: 1 })).toBe("cancelled");
  });

  it("fails a run Galaxy could not schedule, with no failed job", () => {
    expect(settle("failed", {})).toBe("failed");
  });
});

describe("described", () => {
  it("says what to do next after a failure and keeps Galaxy's state", () => {
    const out = described(SCHEDULED, { error: 1 }) as Record<string, unknown>;
    expect(out.outcome).toBe("failed");
    expect(out.job_states).toEqual({ error: 1 });
    expect(out.outcome_note).toContain("get_job_details");
    expect(out.state).toBe("completed");
  });

  it("tells a failing run not to repair it yet", () => {
    const out = described({ ...SCHEDULED, state: "scheduled" }, { error: 1, running: 1 }) as Record<
      string,
      unknown
    >;
    expect(out.outcome).toBe("failing");
    expect(out.outcome_note).toContain("not over");
  });

  it("attaches no note to a healthy run", () => {
    const out = described(SCHEDULED, { ok: 2 }) as Record<string, unknown>;
    expect(out.outcome).toBe("completed");
    expect(out).not.toHaveProperty("outcome_note");
  });
});
