import { describe, expect, it } from "vitest";
import { renderSessionSummary, upsertSessionSummary, type SessionSummary } from "./session-summary";

const S: SessionSummary = {
  id: "sess-1",
  startedAt: "2026-08-19T10:00:00.000Z",
  endedAt: "2026-08-19T10:05:00.000Z",
  record: "page1",
  orphanedActiveSteps: 0,
};
const STARTER = "## Record\n\nThis page is the running record.\n\n_No entries yet._\n";

describe("session summary block", () => {
  it("renders loom's field set", () => {
    const out = renderSessionSummary(S);
    expect(out).toContain("```olit-session");
    for (const f of [
      "id: sess-1",
      "started_at: 2026-08-19T10:00:00.000Z",
      "ended_at: 2026-08-19T10:05:00.000Z",
      "record: page1",
      "orphaned_active_steps: 0",
    ]) {
      expect(out).toContain(f);
    }
  });

  it("appends to a record that has none", () => {
    const out = upsertSessionSummary(STARTER, S);
    expect(out).toContain("_No entries yet._");
    expect(out).toContain("id: sess-1");
  });

  it("replaces rather than accumulates for the same session", () => {
    const once = upsertSessionSummary(STARTER, S);
    const twice = upsertSessionSummary(once, { ...S, endedAt: "2026-08-19T10:30:00.000Z" });
    expect(twice.match(/```olit-session/g)).toHaveLength(1);
    expect(twice).toContain("ended_at: 2026-08-19T10:30:00.000Z");
    expect(twice).not.toContain("ended_at: 2026-08-19T10:05:00.000Z");
  });

  it("keeps the earliest start across turns, as loom merges resumes", () => {
    const once = upsertSessionSummary(STARTER, S);
    const later = upsertSessionSummary(once, {
      ...S,
      startedAt: "2026-08-19T11:00:00.000Z",
      endedAt: "2026-08-19T11:10:00.000Z",
    });
    expect(later).toContain("started_at: 2026-08-19T10:00:00.000Z");
  });

  it("keeps a different session's block alongside", () => {
    const first = upsertSessionSummary(STARTER, S);
    const both = upsertSessionSummary(first, { ...S, id: "sess-2" });
    expect(both.match(/```olit-session/g)).toHaveLength(2);
    expect(both).toContain("id: sess-1");
    expect(both).toContain("id: sess-2");
  });

  it("never disturbs the agent's own content", () => {
    const written = STARTER + "\n## Execution\n\n- [ ] Invoked workflow abc\n";
    const out = upsertSessionSummary(written, S);
    expect(out).toContain("- [ ] Invoked workflow abc");
  });
});
