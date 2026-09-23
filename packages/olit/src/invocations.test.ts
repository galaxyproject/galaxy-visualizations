/** The background watcher that lets the agent hand control back. */

import { afterEach, describe, expect, it, vi } from "vitest";

import { InvocationWatcher, extractWatched, galaxyStateReader, isFailure, isTerminal, settleInvocation, type Watched } from "./invocations";

const runToolResult = (jobs: unknown[]) => JSON.stringify({ jobs, outputs: [{ id: "ds1" }] });

describe("extractWatched", () => {
    it("takes queued job ids out of a run_tool result", () => {
        const out = extractWatched("run_tool", runToolResult([{ id: "job1", state: "new" }]));

        expect(out).toEqual([{ kind: "job", id: "job1", label: "run_tool", state: "new" }]);
    });

    it("takes the invocation id out of an invoke_workflow result", () => {
        const out = extractWatched("invoke_workflow", JSON.stringify({ id: "inv1", state: "new" }));

        expect(out).toEqual([{ kind: "invocation", id: "inv1", label: "invoke_workflow", state: "new" }]);
    });

    it("ignores work that already finished when it came back", () => {
        expect(extractWatched("run_tool", runToolResult([{ id: "job1", state: "ok" }]))).toEqual([]);
    });

    it("ignores tools that submit nothing", () => {
        expect(extractWatched("get_histories", JSON.stringify([{ id: "h1" }]))).toEqual([]);
    });

    it("survives a result that is not the shape we expect", () => {
        for (const bad of ["not json", "null", '"a string"', JSON.stringify({ jobs: "nope" })]) {
            expect(() => extractWatched("run_tool", bad)).not.toThrow();
            expect(extractWatched("run_tool", bad)).toEqual([]);
        }
    });
});

describe("terminal states", () => {
    it("treats a scheduled invocation as still running", () => {
        // `scheduled` means every step was scheduled, not that the jobs finished.
        expect(isTerminal("invocation", "scheduled")).toBe(false);
        expect(isTerminal("invocation", "failed")).toBe(true);
        expect(isTerminal("invocation", "cancelled")).toBe(true);
        expect(isTerminal("invocation", "completed")).toBe(true);
    });

    it("settles a scheduled invocation from its jobs, as loom does", () => {
        expect(settleInvocation("scheduled", { running: 1, ok: 2 })).toBe("scheduled");
        expect(settleInvocation("scheduled", { ok: 3 })).toBe("completed");
        expect(settleInvocation("scheduled", { ok: 2, error: 1 })).toBe("failed");
        expect(settleInvocation("scheduled", {})).toBe("scheduled");
    });

    it("calls a run with a failure beside a live job failing, not failed", () => {
        // loom's second question: a run whose other steps are still moving is not over.
        expect(settleInvocation("scheduled", { error: 1, running: 1 })).toBe("failing");
        expect(settleInvocation("scheduled", { error: 1, paused: 1 })).toBe("failing");
    });

    it("counts every job state loom counts as a failure", () => {
        for (const s of ["error", "failed", "deleted"]) {
            expect(settleInvocation("scheduled", { ok: 1, [s]: 1 })).toBe("failed");
        }
        // Ended some other way, which is not the same as having failed.
        expect(settleInvocation("scheduled", { ok: 1, skipped: 1 })).toBe("completed");
    });

    it("trusts a completed invocation, unless a job errored inside it", () => {
        expect(settleInvocation("completed", { ok: 2, paused: 1 })).toBe("completed");
        expect(settleInvocation("completed", { ok: 1, error: 1 })).toBe("failed");
    });

    it("knows which job states will not change again", () => {
        for (const s of ["ok", "error", "deleted", "discarded"]) expect(isTerminal("job", s)).toBe(true);
        for (const s of ["new", "queued", "running", "paused"]) expect(isTerminal("job", s)).toBe(false);
    });

    it("separates failure from completion so the user is told which", () => {
        expect(isFailure("job", "error")).toBe(true);
        expect(isFailure("job", "ok")).toBe(false);
        expect(isFailure("invocation", "cancelled")).toBe(true);
    });
});

describe("InvocationWatcher", () => {
    function make(states: string[]) {
        const settled: Array<[Watched, string]> = [];
        const progress: Array<[Watched, string]> = [];
        let i = 0;
        const watcher = new InvocationWatcher({
            readState: async () => states[Math.min(i++, states.length - 1)],
            onSettled: (w, s) => settled.push([w, s]),
            onProgress: (w, s) => progress.push([w, s]),
        });
        return { watcher, settled, progress };
    }

    it("reports a job once it reaches a terminal state", async () => {
        const { watcher, settled, progress } = make(["running", "ok"]);
        watcher.ingest("run_tool", runToolResult([{ id: "job1", state: "new" }]));

        await watcher.tick();
        expect(settled).toHaveLength(0);
        expect(progress.map(([, s]) => s)).toEqual(["running"]);

        await watcher.tick();
        expect(settled.map(([w, s]) => [w.id, s])).toEqual([["job1", "ok"]]);
        watcher.stop();
    });

    it("stops watching an item once it settles, so it is reported once", async () => {
        const { watcher, settled } = make(["ok"]);
        watcher.ingest("run_tool", runToolResult([{ id: "job1", state: "new" }]));

        await watcher.tick();
        await watcher.tick();

        expect(settled).toHaveLength(1);
        expect(watcher.pending).toBe(0);
        watcher.stop();
    });

    it("does not watch the same id twice", () => {
        const { watcher } = make(["running"]);
        watcher.ingest("run_tool", runToolResult([{ id: "job1", state: "new" }]));
        watcher.ingest("run_tool", runToolResult([{ id: "job1", state: "new" }]));

        expect(watcher.pending).toBe(1);
        watcher.stop();
    });

    it("keeps watching when Galaxy errors, rather than dropping the job", async () => {
        const settled: Array<[Watched, string]> = [];
        let call = 0;
        const watcher = new InvocationWatcher({
            readState: async () => {
                call += 1;
                if (call === 1) throw new Error("gateway timeout");
                return "ok";
            },
            onSettled: (w, s) => settled.push([w, s]),
        });
        watcher.ingest("run_tool", runToolResult([{ id: "job1", state: "new" }]));

        await watcher.tick();
        expect(watcher.pending).toBe(1); // a blip must not lose the submission
        await watcher.tick();
        expect(settled.map(([, s]) => s)).toEqual(["ok"]);
        watcher.stop();
    });

    it("watches every job a single tool run queued", () => {
        const { watcher } = make(["running"]);
        watcher.ingest("run_tool", runToolResult([{ id: "a", state: "new" }, { id: "b", state: "queued" }]));

        expect(watcher.pending).toBe(2);
        watcher.stop();
    });

    it("starts no timer when a result carries nothing to watch", () => {
        const spy = vi.spyOn(globalThis, "setInterval");
        const { watcher } = make(["ok"]);
        watcher.ingest("get_histories", JSON.stringify([]));

        expect(spy).not.toHaveBeenCalled();
        expect(watcher.pending).toBe(0);
        spy.mockRestore();
    });
});

describe("galaxyStateReader", () => {
    afterEach(() => vi.unstubAllGlobals());

    function galaxy(routes: Record<string, unknown>) {
        vi.stubGlobal("fetch", async (url: string) => {
            const hit = Object.entries(routes).find(([path]) => url.endsWith(path));
            return { ok: Boolean(hit), json: async () => hit?.[1] };
        });
    }

    it("reports a job's state as Galaxy gives it", async () => {
        galaxy({ "api/jobs/j1": { state: "running" } });
        expect(await galaxyStateReader("/", "include")({ kind: "job", id: "j1", label: "run_tool" })).toBe("running");
    });

    it("settles a scheduled invocation whose jobs all finished", async () => {
        // Older Galaxy never moves past `scheduled`; without the jobs this polled forever.
        galaxy({
            "api/invocations/i1": { state: "scheduled" },
            "api/invocations/i1/jobs_summary": { states: { ok: 2 } },
        });
        const read = galaxyStateReader("/", "include");
        expect(await read({ kind: "invocation", id: "i1", label: "invoke_workflow" })).toBe("completed");
    });

    it("keeps a cancelled invocation as cancelled without asking about jobs", async () => {
        galaxy({ "api/invocations/i1": { state: "cancelled" } });
        const read = galaxyStateReader("/", "include");
        expect(await read({ kind: "invocation", id: "i1", label: "invoke_workflow" })).toBe("cancelled");
    });
});
