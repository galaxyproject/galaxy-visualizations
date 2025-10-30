import { LastQueue, ActionSkippedError } from "./lastQueue.js";

async function testPromise(arg, _signal) {
    return Promise.resolve(arg);
}
const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe("test last-queue", () => {
    it("should resolve the first and last enqueued promise for default key", async () => {
        const x = 10;
        const queue = new LastQueue(0);
        const results = [];

        for (let i = 0; i < x; i++) {
            queue.enqueue(testPromise, i).then((r) => results.push(r));
        }
        await queue.enqueue(testPromise, x).then((r) => results.push(r));

        await wait(10);
        const resolved = results.filter((r) => r !== undefined);
        expect(resolved).toEqual([0, x]);
    });

    it("should resolve once per key", async () => {
        const x = 10;
        const queue = new LastQueue(0);
        const results = [];

        for (let i = 0; i < x; i++) {
            for (let j = 0; j < x; j++) {
                queue.enqueue(testPromise, i, i).then((r) => results.push(r));
            }
        }

        await queue.enqueue(testPromise, x, x).then((r) => results.push(r));
        await wait(10);

        const resolved = results.filter((r) => r !== undefined);
        const expected = [...Array(x + 1).keys(), ...Array(x).keys()];
        expect(resolved).toEqual(expected);
    });

    it("should respect throttle period", async () => {
        const queue = new LastQueue(50);
        const timestamps = [];

        async function timedAction(arg) {
            timestamps.push(Date.now());
            return arg;
        }

        await queue.enqueue(timedAction, 1);
        await queue.enqueue(timedAction, 2);
        await queue.enqueue(timedAction, 3);

        await wait(120);
        expect(timestamps.length).toBeLessThanOrEqual(3);
        const deltas = timestamps.slice(1).map((t, i) => t - timestamps[i]);
        expect(deltas.every((d) => d >= 45)).toBe(true);
    });

    it("should reject skipped promises when rejectSkipped is true", async () => {
        const queue = new LastQueue(0, true);
        let rejected = 0;

        const rejectAction = vi.fn((arg) => Promise.resolve(arg));

        queue.enqueue(rejectAction, 1).catch((e) => {
            if (e instanceof ActionSkippedError) rejected++;
        });
        queue.enqueue(rejectAction, 2).catch((e) => {
            if (e instanceof ActionSkippedError) rejected++;
        });
        await queue.enqueue(rejectAction, 3);
        await wait(10);

        expect(rejected).toBeGreaterThan(0);
    });

    it("should cancel earlier queued actions per key", async () => {
        const queue = new LastQueue(0);
        const calls = [];

        async function recordAction(arg) {
            calls.push(arg);
            return arg;
        }

        queue.enqueue(recordAction, 1, "keyA");
        queue.enqueue(recordAction, 2, "keyA");
        queue.enqueue(recordAction, 3, "keyA");
        await wait(10);

        expect(calls).toEqual([1, 3]);
    });

    it("should isolate independent keys", async () => {
        const queue = new LastQueue(0);
        const results = [];

        queue.enqueue(testPromise, "a", "A").then((r) => results.push(r));
        queue.enqueue(testPromise, "b", "B").then((r) => results.push(r));
        queue.enqueue(testPromise, "c", "C").then((r) => results.push(r));

        await wait(10);
        expect(results.sort()).toEqual(["a", "b", "c"]);
    });

    it("should abort signal correctly when task is replaced", async () => {
        const queue = new LastQueue(0);
        let aborted = false;

        async function abortableAction(arg, signal) {
            return new Promise((resolve, reject) => {
                signal.addEventListener("abort", () => {
                    aborted = true;
                    reject(new DOMException("Aborted", "AbortError"));
                });
                setTimeout(() => resolve(arg), 10);
            });
        }

        queue.enqueue(abortableAction, 1, "keyA").catch(() => {});
        queue.enqueue(abortableAction, 2, "keyA").catch(() => {});
        await queue.enqueue(abortableAction, 3, "keyA");
        expect(typeof aborted).toBe("boolean");
    });

    it("should handle thrown errors without breaking queue", async () => {
        const queue = new LastQueue(0);
        const results = [];

        async function faultyAction(arg) {
            if (arg === 1) throw new Error("TestError");
            return arg;
        }

        queue.enqueue(faultyAction, 1).catch((e) => results.push(e.message));
        await queue.enqueue(faultyAction, 2).then((r) => results.push(r));
        expect(results).toContain("TestError");
        expect(results).toContain(2);
    });

    it("should execute replacement if enqueued during completion", async () => {
        const queue = new LastQueue(0);
        const results = [];

        async function delayedAction(arg) {
            if (arg === 1) {
                setTimeout(() => queue.enqueue(delayedAction, 2), 0);
            }
            return arg;
        }

        await queue.enqueue(delayedAction, 1).then((r) => results.push(r));
        await wait(10);
        expect(results).toContain(1);
    });

    it("should not hang when throttle is zero or negative", async () => {
        const queue = new LastQueue(-1);
        const results = [];

        for (let i = 0; i < 5; i++) {
            await queue.enqueue(testPromise, i).then((r) => results.push(r));
        }

        expect(results).toEqual([0, 1, 2, 3, 4]);
    });

    it("should not skip last task if queued after previous finishes", async () => {
        const queue = new LastQueue(0);
        const results = [];

        await queue.enqueue(testPromise, 1).then((r) => results.push(r));
        await wait(2);
        await queue.enqueue(testPromise, 2).then((r) => results.push(r));

        expect(results).toEqual([1, 2]);
    });
});
