import type { Message } from "./messages";
import { localPython } from "./python";
import {
  failedTurn,
  Session,
  type LoopEvent,
  type SessionConfig,
  type TurnResult,
} from "./session";
import type { Artifact, Watched } from "./tool";

export interface RunRequest {
  config: SessionConfig;
  transcripts: Message[];
  artifacts: Artifact[];
  watching: Watched[];
}

export type WorkerMessage =
  | { type: "event"; event: LoopEvent }
  | { type: "confirm"; id: number; title: string; message: string }
  | { type: "result"; result: TurnResult };

const CONTEXT_FIELDS = new Set(["history_id", "dataset_id", "session_id", "record_page_id"]);

let python: ReturnType<typeof localPython> | undefined;
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

function sessionFor(config: SessionConfig): Promise<Session> {
  const identity = JSON.stringify(
    Object.entries(config).filter(([key]) => !CONTEXT_FIELDS.has(key)),
  );
  if (session?.identity !== identity) {
    session = { identity, session: Session.create(config, python!) };
  }
  return session.session;
}

async function run({ config, transcripts, artifacts, watching }: RunRequest): Promise<TurnResult> {
  controller = new AbortController();
  try {
    const current = await sessionFor(config);
    current.rebind(config);
    const prepared = await current.prepare(transcripts, config.record_page_id, config.history_id);
    return await current.turn(prepared, {
      onEvent: (event) => post({ type: "event", event }),
      artifacts,
      watching,
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
    python = localPython(data.pyodideURL);
  } else if (data.type === "run") {
    post({ type: "result", result: await run(data.request) });
  } else if (data.type === "confirmed") {
    confirms.get(data.id)?.(data.approved === true);
    confirms.delete(data.id);
  } else if (data.type === "abort") {
    controller?.abort();
    settleConfirms();
  }
};
