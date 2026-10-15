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

const failed = (id: string) => ({
  id,
  kind: "job" as const,
  state: "error",
  outcome: "failed" as const,
});

/** RECORD with both its jobs noted as the watcher notes them on submission. */
const NOTED = [{ id: "d071e794759ab192" }, { id: "8c49be448cfe29bc" }].reduce(
  (content, { id }) => noteSubmitted(content, { id, kind: "job" }),
  RECORD,
);

describe("applyJobOutcome", () => {
  it("records a finished run's state but leaves its step for the agent to verify", () => {
    const out = applyJobOutcome(NOTED, ok("d071e794759ab192"));
    expect(out).toContain("- [ ] 1. **Filter rows**");
    expect(out).toContain(
      "  - Output dataset: `d071e794759ab192` (Filter on dataset 1)\n" +
        "  - Status: finished (ok) — recorded automatically",
    );
    expect(out).not.toContain("- [x]");
  });

  it("records paused or skipped work, and says what happened", () => {
    const paused = applyJobOutcome(RECORD, {
      id: "d071e794759ab192",
      kind: "job",
      state: "paused",
      outcome: "paused",
    });
    expect(paused).toContain("Status: paused, waiting on an input that failed");
    const skipped = applyJobOutcome(RECORD, {
      id: "d071e794759ab192",
      kind: "job",
      state: "skipped",
      outcome: "skipped",
    });
    expect(skipped).toContain("Status: skipped");
  });

  it("is idempotent — the poller may see the same terminal state repeatedly", () => {
    const once = applyJobOutcome(NOTED, ok("d071e794759ab192"));
    expect(applyJobOutcome(once, ok("d071e794759ab192"))).toBe(once);
  });

  it("leaves the record alone when the id is not mentioned", () => {
    expect(applyJobOutcome(RECORD, ok("ffffffffffffffff"))).toBe(RECORD);
  });

  it("closes out the running line once no submitted work awaits completion", () => {
    const one = applyJobOutcome(NOTED, ok("d071e794759ab192"));
    expect(one).toContain("*Submitted jobs are currently running.*");
    const both = applyJobOutcome(one, ok("8c49be448cfe29bc"));
    expect(both).toContain("*All submitted jobs have finished.*");
    expect(both).not.toContain("currently running");
  });

  it("judges running work by job status, not by the plan's checkboxes", () => {
    const verified = NOTED.replaceAll("- [ ]", "- [x]");
    expect(applyJobOutcome(verified, ok("d071e794759ab192"))).toContain("currently running");
    const finished = applyJobOutcome(
      applyJobOutcome(NOTED, ok("d071e794759ab192")),
      failed("8c49be448cfe29bc"),
    );
    expect(finished).toContain("- [ ] 2. **Sort rows**");
    expect(finished).toContain("*All submitted jobs have finished.*");
  });

  it("records why a run failed and leaves an open step open", () => {
    const out = applyJobOutcome(NOTED, failed("d071e794759ab192"));
    expect(out).toContain("- [ ] 1. **Filter rows**");
    expect(out).toContain("Status: failed (error) — recorded automatically");
  });

  it("leaves a step the agent verified as it is when a run under it fails", () => {
    const verified = NOTED.replace("- [ ] 1. **Filter rows**", "- [x] 1. **Filter rows**");
    const out = applyJobOutcome(verified, failed("d071e794759ab192"));
    expect(out).toContain("- [x] 1. **Filter rows**");
    expect(out).not.toContain("- [!]");
    expect(out).toContain("Status: failed (error) — recorded automatically");
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
    expect(out).toContain("Status: cancelled");
  });

  it("does nothing to an empty record", () => {
    expect(applyJobOutcome("", ok("d071e794759ab192"))).toBe("");
  });
});

describe("noteSubmitted", () => {
  const base = "## Record\n\nSome prose from the agent.\n";

  it("appends an entry of its own, pending and without a checkbox, after what the agent wrote", () => {
    const out = noteSubmitted(base, { id: "417e33144b294c21", kind: "invocation" });
    expect(out).toBe(
      "## Record\n\nSome prose from the agent.\n\n" +
        "- Workflow invocation `417e33144b294c21`\n" +
        "  - Status: submitted, awaiting completion\n",
    );
  });

  it("notes the pending status under an id the agent already wrote, once", () => {
    const withId = base.replace("Some prose", "- Invocation `417e33144b294c21` per the agent");
    const out = noteSubmitted(withId, { id: "417e33144b294c21", kind: "invocation" });
    expect(out).toBe(
      "## Record\n\n- Invocation `417e33144b294c21` per the agent from the agent.\n" +
        "- Status: submitted, awaiting completion\n",
    );
    expect(noteSubmitted(out, { id: "417e33144b294c21", kind: "invocation" })).toBe(out);
  });

  it("pairs with applyJobOutcome, which replaces the pending status it wrote", () => {
    const submitted = noteSubmitted(base, { id: "417e33144b294c21", kind: "invocation" });
    const done = applyJobOutcome(submitted, {
      id: "417e33144b294c21",
      kind: "invocation",
      state: "scheduled",
      outcome: "completed" as const,
    });
    expect(done).toContain(
      "- Workflow invocation `417e33144b294c21`\n" +
        "  - Status: finished (scheduled) — recorded automatically\n",
    );
    expect(done).not.toContain("awaiting completion");
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
    expect(both).toMatch(/`d1`\n {2}- Status: finished \(ok\)/);
    expect(both).toMatch(/`d2`\n {2}- Status: finished \(ok\)/);
  });

  it("prefers the session's own entry for the id", () => {
    const noted = noteSubmitted(record, { id: "d1", kind: "dataset" });
    const updated = applyJobOutcome(noted, ok);
    expect(updated).toContain("- [ ] Step 2: call variants");
    expect(updated).toMatch(/- Galaxy dataset `d1`\n {2}- Status: finished \(ok\)/);
  });
});
