/** The session's watch on submitted Galaxy work, which lets the agent hand control back. */

import { describe, expect, it } from "vitest";

import type { Galaxy } from "./galaxy";
import {
  followUpPrompt,
  isFailure,
  isTerminal,
  outcomeOf,
  stateReader,
  Watch,
  watchedFrom,
  type Watched,
} from "./watch";

describe("watchedFrom", () => {
  it("takes queued job ids out of a run_tool result", () => {
    expect(watchedFrom("run_tool", { jobs: [{ id: "job1", state: "new" }] })).toEqual([
      { kind: "job", id: "job1", label: "run_tool", state: "new" },
    ]);
  });

  it("takes queued job ids out of a run_user_tool result", () => {
    expect(watchedFrom("run_user_tool", { jobs: [{ id: "job2", state: "queued" }] })).toEqual([
      { kind: "job", id: "job2", label: "run_user_tool", state: "queued" },
    ]);
  });

  it("names a tool run's outputs on its jobs, so reading one counts as polling", () => {
    const data = { jobs: [{ id: "j1", state: "new" }], outputs: [{ id: "d1" }, { id: "d2" }] };
    expect(watchedFrom("run_tool", data)[0].outputs).toEqual(["d1", "d2"]);
  });

  it("watches every invocation a batch expanded to", () => {
    const batch = [
      { id: "i1", state: "new" },
      { id: "i2", state: "new" },
    ];
    expect(watchedFrom("invoke_workflow", batch).map((w) => w.id)).toEqual(["i1", "i2"]);
  });

  it("watches every job a single tool run queued", () => {
    const jobs = [
      { id: "a", state: "new" },
      { id: "b", state: "queued" },
    ];
    expect(watchedFrom("run_tool", { jobs }).map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("takes the invocation id out of an invoke_workflow result", () => {
    expect(watchedFrom("invoke_workflow", { id: "inv1", state: "new" })).toEqual([
      { kind: "invocation", id: "inv1", label: "invoke_workflow", state: "new" },
    ]);
  });

  it("watches what an upload created, because the receipt is not an outcome", () => {
    const outputs = [
      { id: "d1", hda_ldda: "hda", state: "queued" },
      { id: "d2", hda_ldda: "hda" },
    ];
    expect(watchedFrom("upload_file_from_url", { outputs })).toEqual([
      { kind: "dataset", id: "d1", label: "upload_file_from_url", state: "queued" },
      { kind: "dataset", id: "d2", label: "upload_file_from_url", state: undefined },
    ]);
  });

  it("ignores work that already finished when it came back", () => {
    expect(watchedFrom("run_tool", { jobs: [{ id: "job1", state: "ok" }] })).toEqual([]);
  });

  it("ignores tools that submit nothing, and shapes it does not know", () => {
    expect(watchedFrom("get_histories", [{ id: "h1" }])).toEqual([]);
    for (const odd of [null, "text", { jobs: "nope" }, { jobs: [null, 7] }]) {
      expect(watchedFrom("run_tool", odd)).toEqual([]);
    }
  });
});

describe("terminal states", () => {
  it("treats a scheduled invocation as still running", () => {
    // `scheduled` means every step was scheduled, not that the jobs finished.
    expect(isTerminal("invocation", "scheduled")).toBe(false);
    expect(isTerminal("invocation", "completed")).toBe(true);
  });

  it("knows which job and dataset states will not change again", () => {
    expect(isTerminal("job", "running")).toBe(false);
    expect(isTerminal("job", "ok")).toBe(true);
    expect(isTerminal("dataset", "queued")).toBe(false);
    expect(isTerminal("dataset", "error")).toBe(true);
  });

  it("calls an errored dataset a failure, which its fetch job does not", () => {
    expect(isFailure("dataset", "error")).toBe(true);
    expect(isFailure("job", "ok")).toBe(false);
  });

  it("stops watching a dataset at every state Galaxy calls terminal", () => {
    for (const state of ["ok", "empty", "error", "deferred", "discarded", "failed_metadata"]) {
      expect(isTerminal("dataset", state), state).toBe(true);
    }
  });

  it("stops at a paused dataset, which only the user can move on", () => {
    expect(isTerminal("dataset", "paused")).toBe(true);
    expect(isFailure("dataset", "paused")).toBe(false);
  });

  it("calls a dataset a failure exactly where Galaxy does", () => {
    for (const state of ["error", "discarded", "failed_metadata"]) {
      expect(isFailure("dataset", state), state).toBe(true);
    }
    for (const state of ["ok", "empty", "deferred"]) {
      expect(isFailure("dataset", state), state).toBe(false);
    }
  });

  it("reports a failed or deleted job as failed, not completed", () => {
    for (const state of ["error", "failed", "deleted"]) {
      expect(outcomeOf("job", state), state).toBe("failed");
    }
    expect(outcomeOf("job", "skipped")).toBe("completed");
  });

  it("answers cancelled as itself, because a stop the user asked for is not a failure", () => {
    expect(outcomeOf("invocation", "cancelled")).toBe("cancelled");
    expect(outcomeOf("job", "error")).toBe("failed");
    expect(outcomeOf("job", "ok")).toBe("completed");
  });
});

const JOB: Watched = { kind: "job", id: "j1", label: "run_tool", state: "queued" };

describe("Watch", () => {
  it("reports an item once it reaches a terminal state, then stops watching it", async () => {
    const states: Record<string, string> = { j1: "running" };
    const watch = new Watch(async (w) => states[w.id]);
    watch.add([JOB]);
    expect(await watch.poll()).toEqual([]);
    states.j1 = "ok";
    expect(await watch.poll()).toEqual([
      { watched: { ...JOB, state: "ok" }, state: "ok", outcome: "completed" },
    ]);
    expect(watch.pending).toBe(0);
    expect(await watch.poll()).toEqual([]);
  });

  it("names what it is still watching, with the state last read", async () => {
    const watch = new Watch(async () => "running");
    watch.add([JOB]);
    await watch.poll();
    expect(watch.list()).toEqual([{ ...JOB, state: "running" }]);
  });

  it("does not watch the same id twice, and says what it newly took on", () => {
    const watch = new Watch(async () => undefined);
    expect(watch.add([JOB])).toHaveLength(1);
    expect(watch.add([JOB])).toEqual([]);
    expect(watch.pending).toBe(1);
  });

  it("keeps watching when Galaxy errors, rather than dropping the job", async () => {
    const watch = new Watch(async () => {
      throw new Error("502");
    });
    watch.add([JOB]);
    expect(await watch.poll()).toEqual([]);
    expect(watch.pending).toBe(1);
  });
});

/** A Galaxy that answers these paths and nothing else. */
const galaxy = (answers: Record<string, unknown>, asked: string[] = []) =>
  ({
    get: async (path: string) => {
      asked.push(path);
      return answers[path];
    },
  }) as unknown as Galaxy;

describe("Watch, polled twice at once", () => {
  it("reports a settled item once", async () => {
    const watch = new Watch(async () => "ok");
    watch.add([{ kind: "job", id: "j1", label: "run_tool", state: "running" }]);
    const [a, b] = await Promise.all([watch.poll(), watch.poll()]);
    expect(a.length + b.length).toBe(1);
  });
});

describe("stateReader", () => {
  it("reports a job's state as Galaxy gives it", async () => {
    const read = stateReader(galaxy({ "api/jobs/j1": { state: "running" } }));
    expect(await read(JOB)).toBe("running");
  });

  it("settles a scheduled invocation whose jobs all finished", async () => {
    const read = stateReader(
      galaxy({
        "api/invocations/i1": { state: "scheduled" },
        "api/invocations/i1/jobs_summary": { states: { ok: 3 } },
      }),
    );
    expect(await read({ kind: "invocation", id: "i1", label: "invoke_workflow" })).toBe(
      "completed",
    );
  });

  it("settles a run failed once only the jobs Galaxy paused behind the failure remain", async () => {
    const read = stateReader(
      galaxy({
        "api/invocations/i1": { state: "scheduled" },
        "api/invocations/i1/jobs_summary": { states: { ok: 2, error: 1, paused: 3 } },
      }),
    );
    expect(await read({ kind: "invocation", id: "i1", label: "invoke_workflow" })).toBe("failed");
  });

  it("gives no state while the jobs summary cannot be read, so the next poll asks again", async () => {
    const read = stateReader(galaxy({ "api/invocations/i1": { state: "completed" } }));
    expect(await read({ kind: "invocation", id: "i1", label: "invoke_workflow" })).toBeUndefined();
  });

  it("keeps a cancelled invocation as cancelled without asking about jobs", async () => {
    const asked: string[] = [];
    const read = stateReader(galaxy({ "api/invocations/i1": { state: "cancelled" } }, asked));
    expect(await read({ kind: "invocation", id: "i1", label: "invoke_workflow" })).toBe(
      "cancelled",
    );
    expect(asked).toEqual(["api/invocations/i1"]);
  });
});

describe("followUpPrompt", () => {
  it("asks for a turn about runs that finished or failed", () => {
    const prompt = followUpPrompt([
      { watched: JOB, state: "ok", outcome: "completed" },
      { watched: { ...JOB, id: "j2" }, state: "error", outcome: "failed" },
    ])!;
    expect(prompt.startsWith("[Olit automatic Galaxy follow-up]")).toBe(true);
    expect(prompt).toContain('"label": "Galaxy job j1"');
    expect(prompt).toContain("still have jobs running");
  });

  it("asks for nothing about a run the user cancelled", () => {
    const cancelled = { kind: "invocation" as const, id: "i1", label: "invoke_workflow" };
    expect(
      followUpPrompt([{ watched: cancelled, state: "cancelled", outcome: "cancelled" }]),
    ).toBeUndefined();
  });
});
