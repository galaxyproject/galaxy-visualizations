import { describe, expect, it } from "vitest";
import { applyJobOutcome, noteSubmitted } from "./record-jobs";

const RECORD = `## Record

### Plan A: Filter and sort [galaxy]

- [ ] 1. **Filter rows** where column 3 > 500 using **Filter1**
  - Input dataset: \`40876639881ca029\` (1.tabular)
  - Output dataset: \`d071e794759ab192\` (Filter on dataset 1)
- [ ] 2. **Sort rows** by column 2 descending using **Sort**
  - Output dataset: \`8c49be448cfe29bc\` (Sort on dataset 2)

*Submitted jobs are currently running.*
`;

const ok = (id: string) => ({ id, kind: "job" as const, state: "ok", failed: false });

describe("applyJobOutcome", () => {
  it("flips the step carrying the id and records the state", () => {
    const out = applyJobOutcome(RECORD, ok("d071e794759ab192"));
    expect(out).toContain("- [x] 1. **Filter rows**");
    expect(out).toContain("Status: finished (ok)");
    // The other step is untouched.
    expect(out).toContain("- [ ] 2. **Sort rows**");
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
      failed: true,
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
      failed: true,
    });
    expect(out).toContain("- [!] 1. **Filter rows**");
    expect(out).not.toContain("- [x] 1. **Filter rows**");
  });

  it("does nothing to an empty record", () => {
    expect(applyJobOutcome("", ok("d071e794759ab192"))).toBe("");
  });
});

describe("noteSubmitted", () => {
  const base = "## Record\n\nSome prose from the agent.\n\n```olit-session\nid: x\n```\n";

  it("adds a pending entry keyed by the id the shell observed", () => {
    const out = noteSubmitted(base, { id: "417e33144b294c21", kind: "invocation" });
    expect(out).toContain("- [ ] Workflow invocation `417e33144b294c21` — submitted");
  });

  it("keeps the session block last", () => {
    const out = noteSubmitted(base, { id: "417e33144b294c21", kind: "invocation" });
    expect(out.indexOf("417e33144b294c21")).toBeLessThan(out.indexOf("```olit-session"));
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
      failed: false,
    });
    expect(done).toContain("- [x] Workflow invocation");
    expect(done).toContain("Status: finished (scheduled)");
  });
});
