import PYODIDE_REQUIREMENTS from "../../pyodide.requirements.txt?raw";

export interface PyodideManagerOptions {
    indexURL: string;
    extraPackages?: string[];
}

export class PyodideManager {
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

    destroy(): void {
        if (!this.destroyed) {
            this.destroyed = true;
            this.worker.terminate();
            this.pending.clear();
        }
    }

    async fsFetch(url: string, dest: string, maxRows: number = 10000): Promise<string> {
        const res = await fetch(url);
        if (res.ok) {
            const content = await res.text();
            await this.fsWrite(content, dest);
            return content.split("\n").filter(Boolean).slice(0, maxRows).join("\n");
        } else {
            throw new Error(`Failed to fetch ${url}`);
        }
    }

    async fsWrite(content: string, dest: string): Promise<void> {
        await this.ready;
        await this.call("fsWrite", { content, dest });
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
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
    }

    async runPythonAsync(code: string): Promise<any> {
        await this.ready;
        return await this.call("runPythonAsync", { code });
    }
}
