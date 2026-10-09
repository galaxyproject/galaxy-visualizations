import { describe, expect, it } from "vitest";
import { applyJobOutcome, noteSubmitted } from "./record-jobs";

const RECORD = `## Record

### Plan A: Filter and sort [remote]

- [ ] 1. **Filter rows** where column 3 > 500 using **Filter1**
  - Input dataset: \`40876639881ca029\` (1.tabular)
  - Output dataset: \`d071e794759ab192\` (Filter on dataset 1)
- [ ] 2. **Sort rows** by column 2 descending using **Sort**
  - Output dataset: \`8c49be448cfe29bc\` (Sort on dataset 2)

*Submitted jobs are currently running.*
`;

const ok = (id: string) => ({
  id,
  kind: "job" as const,
  state: "ok",
  outcome: "completed" as const,
});

describe("applyJobOutcome", () => {
  it("flips the step carrying the id and records the state", () => {
    const out = applyJobOutcome(RECORD, ok("d071e794759ab192"));
    expect(out).toContain("- [x] 1. **Filter rows**");
    expect(out).toContain("Status: finished (ok)");
    // The other step is untouched.
    expect(out).toContain("- [ ] 2. **Sort rows**");
  });

  it("leaves paused or skipped work's step open, and says what happened", () => {
    const paused = applyJobOutcome(RECORD, {
      id: "d071e794759ab192",
      kind: "job",
      state: "paused",
      outcome: "paused",
    });
    expect(paused).toContain("- [ ] 1. **Filter rows**");
    expect(paused).toContain("Status: paused, waiting on an input that failed");
    const skipped = applyJobOutcome(RECORD, {
      id: "d071e794759ab192",
      kind: "job",
      state: "skipped",
      outcome: "skipped",
    });
    expect(skipped).toContain("- [ ] 1. **Filter rows**");
    expect(skipped).toContain("Status: skipped");
  });

  it("is idempotent — the poller may see the same terminal state repeatedly", () => {
    const once = applyJobOutcome(RECORD, ok("d071e794759ab192"));
    expect(applyJobOutcome(once, ok("d071e794759ab192"))).toBe(once);
  });

  it("leaves the record alone when the id is not mentioned", () => {
    expect(applyJobOutcome(RECORD, ok("ffffffffffffffff"))).toBe(RECORD);
  });

  it("closes out the running line only when nothing is left pending", () => {
    const one = applyJobOutcome(RECORD, ok("d071e794759ab192"));
    expect(one).toContain("*Submitted jobs are currently running.*");
    const both = applyJobOutcome(one, ok("8c49be448cfe29bc"));
    expect(both).toContain("*All submitted jobs have finished.*");
    expect(both).not.toContain("currently running");
  });

  it("does not tick a failed step, but does record why", () => {
    const out = applyJobOutcome(RECORD, {
      id: "d071e794759ab192",
      kind: "job",
      state: "error",
      outcome: "failed" as const,
    });
    expect(out).toContain("- [ ] 1. **Filter rows**");
    expect(out).toContain("Status: failed (error)");
  });

  it("unticks a step claimed verified for a job that failed", () => {
    const claimed = RECORD.replace("- [ ] 1. **Filter rows**", "- [x] 1. **Filter rows**");
    const out = applyJobOutcome(claimed, {
      id: "d071e794759ab192",
      kind: "job",
      state: "error",
      outcome: "failed" as const,
    });
    expect(out).toContain("- [!] 1. **Filter rows**");
    expect(out).not.toContain("- [x] 1. **Filter rows**");
  });

  it("leaves a cancelled step unticked, because a stop is not a verification", () => {
    const out = applyJobOutcome(RECORD, {
      id: "d071e794759ab192",
      kind: "invocation",
      state: "cancelled",
      outcome: "cancelled" as const,
    });
    expect(out).toContain("- [ ] 1. **Filter rows**");
    expect(out).toContain("Status: cancelled");
    expect(out).not.toContain("failed");
  });

  it("leaves a step the agent already ticked alone when the run was cancelled", () => {
    const claimed = RECORD.replace("- [ ] 1. **Filter rows**", "- [x] 1. **Filter rows**");
    const out = applyJobOutcome(claimed, {
      id: "d071e794759ab192",
      kind: "invocation",
      state: "cancelled",
      outcome: "cancelled" as const,
    });
    expect(out).toContain("- [x] 1. **Filter rows**");
    expect(out).not.toContain("- [!] 1. **Filter rows**");
  });

  it("does nothing to an empty record", () => {
    expect(applyJobOutcome("", ok("d071e794759ab192"))).toBe("");
  });
});

describe("noteSubmitted", () => {
  const base = "## Record\n\nSome prose from the agent.\n";

  it("adds a pending entry keyed by the id the shell observed", () => {
    const out = noteSubmitted(base, { id: "417e33144b294c21", kind: "invocation" });
    expect(out).toContain("- [ ] Workflow invocation `417e33144b294c21` — submitted");
  });

  it("appends after what the agent wrote, separated by a blank line", () => {
    const out = noteSubmitted(base, { id: "417e33144b294c21", kind: "invocation" });
    expect(out).toBe(
      "## Record\n\nSome prose from the agent.\n\n" +
        "- [ ] Workflow invocation `417e33144b294c21` — submitted, awaiting completion\n",
    );
  });

  it("does not duplicate an id the agent already wrote", () => {
    const withId = base.replace("Some prose", "Invocation `417e33144b294c21` per the agent");
    expect(noteSubmitted(withId, { id: "417e33144b294c21", kind: "invocation" })).toBe(withId);
  });

  it("pairs with applyJobOutcome so the entry it writes can later be advanced", () => {
    const submitted = noteSubmitted(base, { id: "417e33144b294c21", kind: "invocation" });
    const done = applyJobOutcome(submitted, {
      id: "417e33144b294c21",
      kind: "invocation",
      state: "scheduled",
      outcome: "completed" as const,
    });
    expect(done).toContain("- [x] Workflow invocation");
    expect(done).toContain("Status: finished (scheduled)");
  });
});

describe("anchoring", () => {
  const record = [
    "## Plan",
    "",
    "- [ ] Step 2: call variants",
    "",
    "## Results",
    "",
    "```galaxy",
    "history_dataset_display(history_dataset_id=d1)",
    "```",
  ].join("\n");
  const ok = { id: "d1", kind: "dataset", state: "ok", outcome: "completed" } as const;

  it("leaves other plan steps and fenced embeds alone", () => {
    expect(applyJobOutcome(record, ok)).toBe(record);
  });

  it("records each of two neighbouring entries that settle the same way", () => {
    const noted = noteSubmitted(noteSubmitted("# Record", { id: "d1", kind: "dataset" }), {
      id: "d2",
      kind: "dataset",
    });
    const both = applyJobOutcome(applyJobOutcome(noted, { ...ok, id: "d2" }), ok);
    expect(both).toMatch(/- \[x\] .*`d1` — .*\n- Status: finished \(ok\)/);
    expect(both).toMatch(/- \[x\] .*`d2` — .*\n- Status: finished \(ok\)/);
  });

  it("prefers the session's own entry for the id", () => {
    const noted = noteSubmitted(record, { id: "d1", kind: "dataset" });
    const updated = applyJobOutcome(noted, ok);
    expect(updated).toContain("- [ ] Step 2: call variants");
    expect(updated).toMatch(
      /- \[x\] .*`d1` — submitted, awaiting completion\n- Status: finished \(ok\)/,
    );
  });
});
