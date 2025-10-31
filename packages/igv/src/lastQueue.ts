export class ActionSkippedError extends Error {
    constructor(message = "Action skipped") {
        super(message);
        this.name = "ActionSkippedError";
    }
}

interface QueuedAction<T extends (arg: any, signal?: AbortSignal) => Promise<R>, R> {
    action: T;
    arg: Parameters<T>[0];
    resolve: (value: R | undefined) => void;
    reject: (error: Error) => void;
    controller: AbortController;
}

/**
 * A per-key async queue ensuring that only the latest enqueued task runs.
 * The first task starts immediately; later tasks replace pending ones.
 * Once the current task completes, any most recent queued task executes next.
 */
export class LastQueue<T extends (arg: any, signal?: AbortSignal) => Promise<R>, R = any> {
    private throttle: number;
    private rejectSkipped: boolean;
    private queues = new Map<string | number, QueuedAction<T, R>>();
    private pending = new Map<string | number, boolean>();
    private lastRun = new Map<string | number, number>();

    constructor(throttle = 300, rejectSkipped = false) {
        this.throttle = throttle;
        this.rejectSkipped = rejectSkipped;
    }

    private skip(item: QueuedAction<T, R>, key: string | number) {
        item.controller.abort();
        if (this.rejectSkipped) {
            item.reject(new ActionSkippedError());
        } else {
            item.resolve(undefined);
        }
        this.queues.delete(key);
    }

    async enqueue(action: T, arg: Parameters<T>[0], key: string | number = "default"): Promise<R | undefined> {
        const controller = new AbortController();
        const task: QueuedAction<T, R> = { action, arg, resolve: () => {}, reject: () => {}, controller };

        return new Promise((resolve, reject) => {
            task.resolve = resolve;
            task.reject = reject;

            if (this.queues.has(key)) {
                const prev = this.queues.get(key)!;
                this.skip(prev, key);
            }

            this.queues.set(key, task);
            if (!this.pending.has(key)) {
                this.dequeue(key);
            }
        });
    }

    private async dequeue(key: string | number) {
        if (!this.pending.has(key) && this.queues.has(key)) {
            const now = Date.now();
            const last = this.lastRun.get(key) || 0;
            const delay = this.throttle - (now - last);

            if (delay > 0) {
                setTimeout(() => this.dequeue(key), delay);
            } else {
                const current = this.queues.get(key)!;
                this.queues.delete(key);
                this.pending.set(key, true);
                this.lastRun.set(key, now);

                try {
                    if (current.controller.signal.aborted) {
                        throw new DOMException("Aborted", "AbortError");
                    }
                    const result = await current.action(current.arg, current.controller.signal);
                    if (current.controller.signal.aborted) {
                        throw new DOMException("Aborted", "AbortError");
                    }
                    current.resolve(result);
                } catch (e: any) {
                    if (e.name === "AbortError") {
                        if (this.rejectSkipped) {
                            current.reject(new ActionSkippedError());
                        } else {
                            current.resolve(undefined);
                        }
                    } else {
                        current.reject(e);
                    }
                } finally {
                    this.pending.delete(key);
                    if (this.queues.has(key)) {
                        this.dequeue(key);
                    }
                }
            }
        }
    }
}
