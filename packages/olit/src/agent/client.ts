import type { LoopEvent, TurnResult } from "./session";
import type { RunRequest, WorkerMessage } from "./worker";

/** The agent worker as the page sees it: one turn at a time, events and approvals on the side. */
export class AgentClient {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

  constructor(pyodideURL: string) {
    this.worker.postMessage({ type: "initialize", pyodideURL });
  }

  run(
    request: RunRequest,
    onEvent: (event: LoopEvent) => void,
    onConfirm: (id: number, request: { title: string; message: string }) => void,
  ): Promise<TurnResult> {
    return new Promise((resolve) => {
      this.worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
        if (data.type === "event") {
          onEvent(data.event);
        } else if (data.type === "confirm") {
          onConfirm(data.id, data);
        } else {
          resolve(data.result);
        }
      };
      this.worker.postMessage({ type: "run", request });
    });
  }

  confirm(id: number, approved: boolean): void {
    this.worker.postMessage({ type: "confirmed", id, approved });
  }

  abort(): void {
    this.worker.postMessage({ type: "abort" });
  }
}
