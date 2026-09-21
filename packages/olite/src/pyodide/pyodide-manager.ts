import PYODIDE_REQUIREMENTS from "../../pyodide.requirements.txt?raw";

export interface PyodideManagerOptions {
    indexURL: string;
    extraPackages?: string[];
}

export class PyodideManager {
    // Set per run to receive live progress events forwarded from the worker.
    onEvent?: (event: any) => void;
    // Set per run to answer an approval; the turn is parked until it is answered.
    onConfirm?: (confirmId: string, request: any) => void;
    private destroyed: boolean;
    private packages: string[];
    private pending: Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>;
    private ready: Promise<void>;
    private worker: Worker;

    constructor(options: PyodideManagerOptions) {
        this.destroyed = false;
        this.packages = this.parsePackages();
        this.pending = new Map();
        this.worker = new Worker(`${options.indexURL}/pyodide-worker.js`, {
            type: "module",
        });
        this.ready = new Promise((resolve, reject) => {
            this.worker.onmessage = (e) => {
                const { type, id, result, error } = e.data;
                if (type === "ready") {
                    resolve();
                    return;
                }
                if (type === "error") {
                    reject(new Error(error || "Pyodide initialization failed"));
                    return;
                }
                if (type === "event") {
                    this.onEvent?.(e.data.event);
                    return;
                }
                if (type === "confirm") {
                    // With no handler bound the turn would park forever; deny.
                    if (this.onConfirm) {
                        this.onConfirm(e.data.confirmId, e.data.request);
                    } else {
                        this.respondToConfirm(e.data.confirmId, false);
                    }
                    return;
                }
                if (id && this.pending.has(id)) {
                    const entry = this.pending.get(id)!;
                    this.pending.delete(id);
                    error ? entry.reject(error) : entry.resolve(result);
                }
            };
            this.worker.onerror = (e) => {
                reject(e);
            };
        });
        this.worker.postMessage({
            type: "initialize",
            payload: { indexURL: options.indexURL, extraPackages: options.extraPackages, packages: this.packages },
        });
    }

    private call(type: string, payload?: any): Promise<any> {
        if (this.destroyed) {
            return Promise.reject("Pyodide destroyed");
        } else {
            return new Promise((resolve, reject) => {
                const id = crypto.randomUUID();
                this.pending.set(id, { resolve, reject });
                this.worker.postMessage({ type, payload, id });
            });
        }
    }

    /** Answer an approval request, resuming the parked turn. */
    respondToConfirm(confirmId: string, approved: boolean): void {
        if (!this.destroyed) {
            this.worker.postMessage({ type: "confirmResult", payload: { confirmId, approved } });
        }
    }

    /** Stop the run in flight; fire-and-forget, the run settles with an aborted result. */
    abort(): void {
        if (!this.destroyed) {
            this.worker.postMessage({ type: "abort" });
        }
    }

    destroy(): void {
        if (!this.destroyed) {
            this.destroyed = true;
            this.worker.terminate();
            this.pending.clear();
        }
    }

    async initialize(): Promise<void> {
        if (!this.destroyed) {
            await this.ready;
        } else {
            throw new Error("Pyodide destroyed");
        }
    }

    parsePackages() {
        return PYODIDE_REQUIREMENTS.split("\n")
            .map((v: string) => v.trim())
            .filter((v: string) => v.length > 0);
    }

    async runPythonAsync(code: string): Promise<any> {
        await this.ready;
        return await this.call("runPythonAsync", { code });
    }
}
