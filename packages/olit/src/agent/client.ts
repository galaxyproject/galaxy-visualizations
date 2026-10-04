import type { StartRequest, WorkerEvent } from "./worker";

export class AgentClient {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

  constructor(request: StartRequest) {
    this.worker.postMessage({ type: "start", request });
  }

  /** Resolves when the turn settles, with its error if it failed. */
  prompt(text: string, onEvent: (event: WorkerEvent) => void): Promise<string | undefined> {
    return new Promise((resolve) => {
      this.worker.onmessage = ({ data }: MessageEvent<WorkerEvent>) => {
        onEvent(data);
        if (data.type === "settled") {
          resolve(data.error);
        }
      };
      this.worker.postMessage({ type: "prompt", text });
    });
  }

  confirm(id: number, approved: boolean): void {
    this.worker.postMessage({ type: "confirmed", id, approved });
  }

  abort(): void {
    this.worker.postMessage({ type: "abort" });
  }
}
