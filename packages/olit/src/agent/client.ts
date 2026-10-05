import type { LoopEvent, TurnResult } from "./session";
import type { RunRequest, SettleResult, WorkerMessage } from "./worker";

/** The agent worker as the page sees it: one turn at a time, events and approvals on the side. */
export class AgentClient {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  private turn?: {
    onEvent: (event: LoopEvent) => void;
    onConfirm: (id: number, request: { title: string; message: string }) => void;
    resolve: (result: TurnResult) => void;
  };
  private settles = new Map<number, (result: SettleResult) => void>();
  private settleId = 0;

  constructor(pyodideURL: string) {
    this.worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if (data.type === "settled") {
        this.settles.get(data.id)?.(data.result);
        this.settles.delete(data.id);
      } else if (data.type === "event") {
        this.turn?.onEvent(data.event);
      } else if (data.type === "confirm") {
        this.turn?.onConfirm(data.id, data);
      } else {
        this.turn?.resolve(data.result);
        this.turn = undefined;
      }
    };
    this.worker.postMessage({ type: "initialize", pyodideURL });
  }

  run(
    request: RunRequest,
    onEvent: (event: LoopEvent) => void,
    onConfirm: (id: number, request: { title: string; message: string }) => void,
  ): Promise<TurnResult> {
    return new Promise((resolve) => {
      this.turn = { onEvent, onConfirm, resolve };
      this.worker.postMessage({ type: "run", request });
    });
  }

  /** One pass over the session's unfinished Galaxy work. */
  settle(request: Pick<RunRequest, "config" | "watching">): Promise<SettleResult> {
    return new Promise((resolve) => {
      const id = this.settleId++;
      this.settles.set(id, resolve);
      this.worker.postMessage({ type: "settle", id, request });
    });
  }

  confirm(id: number, approved: boolean): void {
    this.worker.postMessage({ type: "confirmed", id, approved });
  }

  abort(): void {
    this.worker.postMessage({ type: "abort" });
  }
}
