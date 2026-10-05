import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { browserPython } from "./python";
import {
  failedTurn,
  Session,
  type LoopEvent,
  type SessionConfig,
  type TurnResult,
} from "./session";
import type { Artifact, Python } from "./tool";
import type { Settled, Watched } from "./watch";

export interface RunRequest {
  config: SessionConfig;
  transcripts: AgentMessage[];
  artifacts: Artifact[];
  /** Work a reloaded page had open; the session watches it again. */
  watching: Watched[];
}

export interface SettleResult {
  settled: Settled[];
  pending: number;
  watching: Watched[];
  followUp?: string;
}

export type WorkerMessage =
  | { type: "event"; event: LoopEvent }
  | { type: "confirm"; id: number; title: string; message: string }
  | { type: "result"; result: TurnResult }
  | { type: "settled"; id: number; result: SettleResult };

const CONTEXT_FIELDS = new Set([
  "history_id",
  "dataset_id",
  "session_id",
  "record_page_id",
  "session_started_at",
]);

let python: Python | undefined;
let session: { identity: string; session: Promise<Session> } | undefined;
let controller: AbortController | undefined;
const confirms = new Map<number, (approved: boolean) => void>();
let confirmId = 0;

const post = (message: WorkerMessage) => self.postMessage(message);

function ask(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (controller?.signal.aborted) {
      resolve(false);
      return;
    }
    const id = confirmId++;
    confirms.set(id, resolve);
    post({ type: "confirm", id, title, message });
  });
}

function settleConfirms() {
  confirms.forEach((resolve) => resolve(false));
  confirms.clear();
}

async function sessionFor({ config, watching }: Pick<RunRequest, "config" | "watching">) {
  const identity = JSON.stringify(
    Object.entries(config).filter(([key]) => !CONTEXT_FIELDS.has(key)),
  );
  const fresh = session?.identity !== identity;
  if (fresh) {
    const created = Session.create(config, python!);
    session = { identity, session: created };
    created.catch(() => session?.session === created && (session = undefined));
  }
  const current = await session!.session;
  if (fresh) {
    current.watch.add(watching);
  }
  current.rebind(config, watching);
  return current;
}

async function run({ config, transcripts, artifacts, watching }: RunRequest): Promise<TurnResult> {
  controller = new AbortController();
  try {
    const current = await sessionFor({ config, watching });
    return await current.turn(transcripts, {
      onEvent: (event) => post({ type: "event", event }),
      artifacts,
      ask,
      signal: controller.signal,
    });
  } catch (err) {
    return failedTurn(transcripts, err);
  } finally {
    controller = undefined;
    settleConfirms();
  }
}

self.onmessage = async ({ data }) => {
  if (data.type === "initialize") {
    python = browserPython(data.pyodideURL);
  } else if (data.type === "run") {
    post({ type: "result", result: await run(data.request) });
  } else if (data.type === "confirmed") {
    confirms.get(data.id)?.(data.approved === true);
    confirms.delete(data.id);
  } else if (data.type === "settle") {
    // Between turns or during one, and before the first turn of a reloaded page.
    const request = data.request as Pick<RunRequest, "config" | "watching">;
    let result: SettleResult = { settled: [], pending: 0, watching: request.watching };
    try {
      result = await (await sessionFor(request)).settle();
    } catch {
      // Nothing to report this pass; the next one reads again.
    }
    post({ type: "settled", id: data.id, result });
  } else if (data.type === "abort") {
    controller?.abort();
    settleConfirms();
  }
};
