/** The conversation's watch on submitted Galaxy work, which lets the agent hand control back. */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Models } from "@earendil-works/pi-ai";
import {
  createRegistry,
  defineExtension,
  Harness,
  InboxDoc,
  MemoryStorage,
  type Conversation,
  type Storage,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { describe, expect, it } from "vitest";

import {
  DATASET_TERMINAL_STATES,
  INVOCATION_FINISHED_STATES,
  JOB_SETTLED_STATES,
} from "@galaxyproject/galaxy-ops/browser";

import { FollowUps } from "./documents";
import { FOLLOW_UP_MARK } from "./markers";
import { HttpError, type Galaxy } from "./galaxy";
import { context, watchedBy } from "./runtime";
import {
  followUpPrompt,
  galaxyWatch,
  FOLLOWS_UP,
  isTerminal,
  outcomeOf,
  SETTLED,
  stateReader,
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

describe("what a settled state amounts to", () => {
  it("settles exactly where Galaxy and galaxy-ops call a state final, and at a paused dataset", () => {
    // Galaxy's Job.is_terminal, plus `failed`, which galaxy-ops settles too.
    expect(Object.keys(SETTLED.job).sort()).toEqual(
      [...new Set([...JOB_SETTLED_STATES, "paused"])].sort(),
    );
    expect(Object.keys(SETTLED.dataset).sort()).toEqual(
      [...DATASET_TERMINAL_STATES, "paused"].sort(),
    );
    expect(Object.keys(SETTLED.invocation).sort()).toEqual([...INVOCATION_FINISHED_STATES].sort());
    expect(isTerminal("invocation", "scheduled")).toBe(false);
    expect(isTerminal("job", "running")).toBe(false);
  });

  it("calls a cancel a cancel and a skip a skip, as loom does, not a failure or a success", () => {
    expect(outcomeOf("job", "deleted")).toBe("cancelled");
    expect(outcomeOf("job", "stopped")).toBe("cancelled");
    expect(outcomeOf("invocation", "cancelled")).toBe("cancelled");
    expect(outcomeOf("job", "skipped")).toBe("skipped");
  });

  it("calls paused work paused, since it waits on a failed input rather than finishing", () => {
    expect(outcomeOf("job", "paused")).toBe("paused");
    expect(outcomeOf("dataset", "paused")).toBe("paused");
  });

  it("calls a failure a failure exactly where Galaxy does", () => {
    for (const state of ["error", "discarded", "failed_metadata"]) {
      expect(outcomeOf("dataset", state), state).toBe("failed");
    }
    for (const state of ["error", "failed"]) {
      expect(outcomeOf("job", state), state).toBe("failed");
    }
    expect(outcomeOf("dataset", "ok")).toBe("completed");
  });

  it("follows up on what the model has to act on, not on what someone chose", () => {
    expect(
      Object.entries(FOLLOWS_UP)
        .filter(([, yes]) => yes)
        .map(([o]) => o)
        .sort(),
    ).toEqual(["completed", "failed", "paused", "unreadable"]);
  });
});

const JOB: Watched = { kind: "job", id: "j1", label: "run_tool", state: "queued" };

/** A Harness running only the watch task, over `storage`, against a Galaxy answering `state`. */
async function watching(
  storage: Storage,
  state: () => string | Error,
  edits: string[] = [],
  unwritten?: string,
) {
  const galaxy = {
    get: async () => {
      const s = state();
      if (s instanceof Error) throw s;
      return { state: s };
    },
  } as unknown as Galaxy;
  const watch = galaxyWatch({
    galaxy,
    pollMs: 5,
    editRecord: async (_id, edit) => {
      edits.push(edit(""));
      return unwritten;
    },
  });
  const registry = createRegistry();
  registry.install(defineExtension({ name: "watch", tasks: [watch] }));
  const harness = await Harness.open(storage, { models: {} as Models, registry }, context);
  return { harness, watch };
}

async function submitted(
  storage: Storage,
  state: () => string | Error,
  edits?: string[],
  paused = false,
  unwritten?: string,
) {
  const { harness, watch } = await watching(storage, state, edits, unwritten);
  const conversation = await harness.createConversation(
    { ownership: { kind: "ownerless" } },
    context,
  );
  const task = await conversation.commit(async (tx) => {
    if (paused) (await tx.doc(FollowUps, conversation.id)).paused = true;
    return tx.createTask(watch, JOB, {
      ownership: { kind: "conversation" },
      conversationId: conversation.id,
      background: true,
    });
  }, context);
  harness.resume();
  return { harness, conversation, task };
}

/** What the conversation was asked, as user entries. */
const followUps = async (conversation: Conversation) =>
  (await conversation.context(context)).entries.flatMap((e) =>
    e.kind === "pi.user" ? [String((e.model?.[0] as { content: unknown }).content)] : [],
  );

describe("the watch task", () => {
  it("notes the work, watches it, and follows up once it settles", async () => {
    let state = "running";
    const edits: string[] = [];
    const { harness, conversation, task } = await submitted(
      new MemoryStorage(),
      () => state,
      edits,
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(await watchedBy(harness, conversation.id, context)).toEqual([
      { ...JOB, state: "running" },
    ]);
    state = "ok";
    const done = await harness.waitForTask(task, context);
    expect(done.state.outcome).toEqual({
      status: "completed",
      result: { watched: { ...JOB, state: "ok" }, state: "ok", outcome: "completed" },
    });
    expect(await watchedBy(harness, conversation.id, context)).toEqual([]);
    const asked = await followUps(conversation);
    expect(asked).toHaveLength(1);
    expect(asked[0].startsWith(FOLLOW_UP_MARK)).toBe(true);
    expect((await harness.snapshot(FollowUps, conversation.id, context))?.automatic).toBe(1);
    expect(edits[0]).toContain("Galaxy job `j1` — submitted");
    await harness.close(context);
  });

  it("records a failure the record did not yet hold, as work submitted before it was opened", async () => {
    const edits: string[] = [];
    const { harness, task } = await submitted(new MemoryStorage(), () => "error", edits);
    await harness.waitForTask(task, context);
    const settled = edits.at(-1)!;
    expect(settled).toContain("Galaxy job `j1`");
    expect(settled).toContain("Status: failed (error) — recorded automatically");
    await harness.close(context);
  });

  it("tells the model and the page when the record could not be updated", async () => {
    const { harness, conversation, task } = await submitted(
      new MemoryStorage(),
      () => "ok",
      [],
      false,
      "record page p1 could not be written (HTTP 400: bad fence)",
    );
    const done = await harness.waitForTask(task, context);
    expect(done.state.outcome).toMatchObject({
      result: { record: "record page p1 could not be written (HTTP 400: bad fence)" },
    });
    const [asked] = await followUps(conversation);
    expect(asked).toContain("The record was not updated for this work");
    expect(asked).toContain("HTTP 400: bad fence");
    await harness.close(context);
  });

  it("settles work Galaxy refuses to show as unreadable, and says so, rather than polling on", async () => {
    const { harness, conversation, task } = await submitted(
      new MemoryStorage(),
      () => new HttpError("HTTP 404: No job", 404),
    );
    const done = await harness.waitForTask(task, context);
    expect(done.state.outcome).toMatchObject({
      result: { state: "HTTP 404", outcome: "unreadable" },
    });
    const [asked] = await followUps(conversation);
    expect(asked).toContain("Galaxy no longer shows some of this work");
    await harness.close(context);
  });

  it("keeps watching when Galaxy errors, rather than dropping the job", async () => {
    let state: string | Error = new Error("502");
    const { harness, conversation, task } = await submitted(new MemoryStorage(), () => state);
    await new Promise((r) => setTimeout(r, 30));
    expect(await watchedBy(harness, conversation.id, context)).toHaveLength(1);
    state = "ok";
    await harness.waitForTask(task, context);
    expect(await watchedBy(harness, conversation.id, context)).toEqual([]);
    await harness.close(context);
  });

  it("queues its follow-up for the user while follow-ups are paused", async () => {
    const { harness, conversation, task } = await submitted(
      new MemoryStorage(),
      () => "ok",
      [],
      true,
    );
    await harness.waitForTask(task, context);
    expect(await followUps(conversation)).toEqual([]);
    const inbox = await harness.snapshot(InboxDoc, conversation.id, context);
    expect(inbox?.items).toHaveLength(1);
    expect((await harness.snapshot(FollowUps, conversation.id, context))?.automatic).toBe(0);
    await harness.close(context);
  });

  it("resumes after the page closes and opens again, and follows up once", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "olit-watch-")), "olit.sqlite3");
    let state = "running";
    const first = await submitted(await openNodeSqliteStorage(file), () => state);
    await new Promise((r) => setTimeout(r, 20));
    await first.harness.close(context);
    state = "ok";
    const { harness } = await watching(await openNodeSqliteStorage(file), () => state);
    harness.resume();
    await harness.waitForTask(first.task, context);
    const conversation = (await harness.conversation(first.conversation.id, context))!;
    expect(await followUps(conversation)).toHaveLength(1);
    await harness.close(context);
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
      { watched: { ...JOB, id: "j2", outputs: ["d9"] }, state: "error", outcome: "failed" },
    ])!;
    expect(prompt.startsWith("[Olit automatic Galaxy follow-up]")).toBe(true);
    expect(prompt).toContain('"label": "Galaxy job j1"');
    // A failed job is read through its output, which get_job_details takes.
    expect(prompt).toContain('"outputs": [\n      "d9"\n    ]');
    // galaxy-ops calls a run failed only once nothing of it is running.
    expect(prompt).not.toContain("still have jobs running");
  });

  it("asks for nothing about a run the user cancelled", () => {
    const cancelled = { kind: "invocation" as const, id: "i1", label: "invoke_workflow" };
    expect(
      followUpPrompt([{ watched: cancelled, state: "cancelled", outcome: "cancelled" }]),
    ).toBeUndefined();
  });
});
