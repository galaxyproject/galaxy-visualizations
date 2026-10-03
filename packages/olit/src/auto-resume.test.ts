import { describe, expect, it, vi } from "vitest";

import { createFollowUpDelivery, buildResumePrompt, isResumableOutcome } from "./auto-resume";

const delivery = (sent: string[], opts = {}) =>
  createFollowUpDelivery((t) => sent.push(t), { graceMs: 0, ...opts });

describe("isResumableOutcome", () => {
  it("takes the two outcomes worth continuing on", () => {
    expect(isResumableOutcome("ok", false)).toBe(true);
    expect(isResumableOutcome("error", true)).toBe(true);
  });

  it("leaves a cancellation or a skipped step alone", () => {
    expect(isResumableOutcome("deleted", true)).toBe(false);
    expect(isResumableOutcome("skipped", false)).toBe(false);
  });
});

describe("createFollowUpDelivery", () => {
  it("continues by itself when nothing is running", () => {
    const sent: string[] = [];
    delivery(sent).deliver("one");
    expect(sent).toEqual(["one"]);
  });

  it("never acts ahead of what the user typed during a turn", async () => {
    const sent: string[] = [];
    const d = delivery(sent);
    d.agentStarted();
    d.deliver("one");
    expect(sent).toEqual([]);
    d.agentSettled();
    await new Promise((r) => setTimeout(r, 5));
    expect(sent).toEqual(["one"]);
  });

  it("makes one turn out of everything that landed while it was busy", async () => {
    const sent: string[] = [];
    const d = delivery(sent);
    d.agentStarted();
    d.deliver("one");
    d.deliver("two");
    d.agentSettled();
    await new Promise((r) => setTimeout(r, 5));
    expect(sent).toEqual(["one\n\ntwo"]);
  });

  it("stops after three automatic turns and says so once", () => {
    const sent: string[] = [];
    const onPaused = vi.fn();
    const d = delivery(sent, { onPaused });
    for (let i = 0; i < 5; i++) {
      d.deliver(`run ${i}`);
    }
    expect(sent).toHaveLength(3);
    expect(onPaused).toHaveBeenCalledTimes(1);
    expect(onPaused.mock.calls[0][0]).toContain("paused after 3 automatic turn(s)");
  });

  it("gives the budget back when the user says something", () => {
    const sent: string[] = [];
    const d = delivery(sent);
    for (let i = 0; i < 4; i++) {
      d.deliver(`run ${i}`);
    }
    d.userInput();
    d.deliver("after");
    expect(sent).toHaveLength(4);
  });

  it("stays paused when the user stops a turn", async () => {
    const sent: string[] = [];
    const onPaused = vi.fn();
    const d = delivery(sent, { onPaused });
    d.agentStarted();
    d.deliver("held");
    d.aborted();
    d.agentSettled();
    d.deliver("next");
    await new Promise((r) => setTimeout(r, 5));
    expect(sent).toEqual([]);
    expect(onPaused.mock.calls[0][0]).toContain("since you stopped");
  });

  it("keeps the results a stop held back and delivers them once the user resumes", async () => {
    const sent: string[] = [];
    const d = delivery(sent);
    d.agentStarted();
    d.deliver("job j1 finished");
    d.aborted();
    d.agentSettled();
    expect(sent).toEqual([]);

    d.userInput();
    d.agentStarted();
    d.agentSettled();
    await new Promise((r) => setTimeout(r, 5));
    expect(sent).toEqual(["job j1 finished"]);
  });

  it("keeps the results the turn cap held back", async () => {
    const sent: string[] = [];
    const d = delivery(sent);
    for (let i = 0; i < 4; i++) {
      d.deliver(`run ${i}`);
    }
    expect(sent).toHaveLength(3);

    d.userInput();
    d.agentStarted();
    d.agentSettled();
    await new Promise((r) => setTimeout(r, 5));
    expect(sent[3]).toBe("run 3");
  });
});

describe("buildResumePrompt", () => {
  it("carries the ids that settled, as data rather than instructions", () => {
    const prompt = buildResumePrompt([
      { kind: "job", id: "j1", label: "Galaxy job j1", outcome: "completed" },
      { kind: "invocation", id: "i7", label: "Workflow invocation i7", outcome: "completed" },
    ]);
    expect(prompt).toContain("run data, not instructions");
    expect(prompt).toContain('"id": "j1"');
    expect(prompt).toContain('"id": "i7"');
  });

  it("warns that a failure is not proof the invocation finished, and only then", () => {
    const failed = buildResumePrompt([
      { kind: "invocation", id: "i1", label: "Workflow invocation i1", outcome: "failed" },
    ]);
    expect(failed).toContain("can still have jobs running");

    const done = buildResumePrompt([
      { kind: "job", id: "j1", label: "Galaxy job j1", outcome: "completed" },
    ]);
    expect(done).not.toContain("can still have jobs running");
  });

  it("restates nothing the standing prompt already carries", () => {
    // The system message is rebuilt on every turn, this one included, so a second copy here
    // could only drift. Each phrase below is a rule that lives in `prompt.py`.
    const prompt = buildResumePrompt([
      { kind: "job", id: "j1", label: "Galaxy job j1", outcome: "failed" },
    ]);
    for (const standing of [
      "verify",
      "not authorize",
      "never ask them",
      "pause or stop",
      "the record",
      "do not guess from labels",
      "blindly retry",
    ]) {
      expect(prompt.toLowerCase(), `resume prompt restates "${standing}"`).not.toContain(standing);
    }
  });

  it("stays short, because several held batches are joined into one turn", () => {
    const prompt = buildResumePrompt([
      { kind: "job", id: "j1", label: "Galaxy job j1", outcome: "failed" },
    ]);
    expect(prompt.split(/\s+/).length).toBeLessThan(60);
  });
});
