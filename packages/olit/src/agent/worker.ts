import {
  InboxDoc,
  LiveDoc,
  MemoryStorage,
  type Storage,
  watchEvents,
  type AgentEvent,
  type Conversation,
  type ConversationId,
  type TaskId,
} from "@earendil-works/pi-durable";

import { Binding, FollowUps, heldBy } from "./documents";
import { connectGalaxy } from "./galaxy";
import type { GalaxyStatus } from "./prompt";
import { browserPython } from "./python";
import { context, Runtime, type Placement, type RuntimeConfig } from "./runtime";
import type { SessionDocument } from "./saved";
import type { RecordSummary } from "./notebook";
import { holdStorage, openStorage } from "./storage";
import { WATCH_TASK, type Settled } from "./watch";

export interface OpenRequest {
  pyodideURL: string;
  config: RuntimeConfig;
  placement: Placement;
  /** A saved session the page was opened on. */
  saved?: { id: string; document: SessionDocument };
  /** Take the conversation over from the tab that has it open. */
  steal?: boolean;
}

/** Why follow-ups are waiting for the user, when they are. */
export type Waiting = "paused" | "capped" | undefined;

export type WorkerMessage =
  /** Another tab has this conversation open. */
  | { type: "waiting" }
  /** Another tab took the conversation over. */
  | { type: "lost" }
  | {
      type: "ready";
      unkept?: string;
      galaxy: GalaxyStatus;
      galaxyProblem?: string;
      /** Why the history's earlier records could not be looked up. */
      recordsProblem?: string;
    }
  /** No session kept here, but the launch history has Olit records to choose from. */
  | { type: "recoverable"; records: RecordSummary[] }
  | { type: "events"; events: readonly AgentEvent[] }
  /** Galaxy work the conversation watched has settled. */
  | { type: "settled"; settled: Settled }
  | { type: "held"; held: Waiting }
  | { type: "confirm"; id: number; title: string; message: string }
  /** A confirmation the agent no longer waits on. */
  | { type: "withdrawn"; id: number }
  | { type: "reply"; id: number; value?: unknown; error?: string }
  | { type: "failed"; message: string };

export type PageMessage =
  | { type: "open"; request: OpenRequest }
  | { type: "submit"; text: string }
  | { type: "stop" }
  | { type: "confirmed"; id: number; approved: boolean }
  | { type: "reset" }
  | { type: "switch"; id: number; config: Partial<RuntimeConfig> }
  | { type: "export"; id: number; title: string }
  | { type: "saved"; id: number; savedId: string; document: SessionDocument }
  /** Continue the session whose record is `pageId`, or start a new one. */
  | { type: "recover"; pageId?: string };

const post = (message: WorkerMessage) => self.postMessage(message);

/** Confirmations waiting on the user, each held by the conversation whose run asked. */
const confirms = new Map<
  number,
  { conversation: ConversationId; resolve: (approved: boolean) => void }
>();
let confirmId = 0;
let runtime: Runtime | undefined;
let conversation: Conversation | undefined;
let detach: (() => Promise<unknown>) | undefined;
let held: Waiting;
/** A launch waiting for the user to choose among the history's records. */
let choosing: { placement: Placement; records: RecordSummary[]; unkept?: string } | undefined;

function ask(title: string, message: string, conversation: ConversationId): Promise<boolean> {
  return new Promise((resolve) => {
    const id = confirmId++;
    confirms.set(id, { conversation, resolve });
    post({ type: "confirm", id, title, message });
  });
}

/** Decline what `conversation`'s run is waiting on, so that run can end. */
function decline(conversation: ConversationId) {
  for (const [id, waiting] of confirms) {
    if (waiting.conversation !== conversation) continue;
    confirms.delete(id);
    waiting.resolve(false);
    post({ type: "withdrawn", id });
  }
}

/** Follow-ups queued for the user while the conversation is idle, and why. */
async function postHeld() {
  if (!runtime || !conversation) return;
  const id = conversation.id;
  const [policy, inbox, live] = await Promise.all([
    runtime.harness.snapshot(FollowUps, id, context),
    runtime.harness.snapshot(InboxDoc, id, context),
    runtime.harness.snapshot(LiveDoc, id, context),
  ]);
  const queued = !live?.run && (inbox?.items ?? []).some((item) => item.mode !== "write");
  const next: Waiting = queued ? heldBy(policy) : undefined;
  if (next !== held) {
    held = next;
    post({ type: "held", held });
  }
}

/** Show `next` on the page: its events from a snapshot on, and the Galaxy work that settles. */
async function attach(next: Conversation) {
  await detach?.();
  conversation = next;
  held = undefined;
  const harness = runtime!.harness;
  const stream = await watchEvents(harness, next.id, context);
  post({ type: "events", events: [stream.snapshot] });
  stream.start(async (events) => {
    post({ type: "events", events });
    if (events.some((e) => e.type === "run_end")) decline(next.id);
    await postHeld();
  });
  const graph = await harness.watchTaskGraph(context);
  const watched = (tasks: typeof graph.value.tasks) =>
    Object.values(tasks)
      .filter((t) => t.kind === WATCH_TASK && t.conversationId === next.id)
      .map((t) => t.id);
  let known = new Set<TaskId>(watched(graph.value.tasks));
  graph.start(async (value) => {
    const now = new Set<TaskId>(watched(value.tasks));
    for (const id of known) {
      if (now.has(id)) continue;
      const outcome = (await harness.getTask(id, context))?.state;
      if (outcome?.status === "terminal" && outcome.outcome.status === "completed") {
        post({ type: "settled", settled: outcome.outcome.result as unknown as Settled });
      }
    }
    known = now;
  });
  await postHeld();
  detach = async () => {
    await stream.stop();
    await graph.stop();
  };
}

async function open(request: OpenRequest) {
  const galaxy = connectGalaxy({
    root: request.config.galaxy_root,
    credentials: request.config.credentials,
  });
  // An anonymous user has no id; a lookup that failed is not one, and keeps nothing rather than
  // mixing this user's conversations into another identity's files.
  let unkept: string | undefined;
  const user = await galaxy.get("api/users/current").then(
    (body) => (typeof body?.id === "string" && body.id ? body.id : "anon"),
    (e) => {
      unkept = `the Galaxy user could not be identified: ${String((e as Error)?.message ?? e)}`;
      return undefined;
    },
  );
  let storage: Storage = new MemoryStorage();
  if (user !== undefined) {
    // The file pool is one per origin, whichever Galaxy user opens it, so the tab lock is too.
    await holdStorage("storage", {
      steal: request.steal,
      waiting: () => post({ type: "waiting" }),
      // Ending the worker lets go of the files it holds open, which the other tab needs.
      lost: () => {
        post({ type: "lost" });
        self.close();
      },
    });
    ({ storage, unkept } = await openStorage(`olit-${user}`));
  }
  runtime = await Runtime.open({
    storage,
    config: request.config,
    python: browserPython(request.pyodideURL),
    ask,
  });
  if (request.saved) {
    return begin(await runtime.open(request.saved.document, request.saved.id), unkept);
  }
  const kept = await runtime.kept(request.placement);
  if (kept) return begin(kept, unkept);
  // Nothing of a session here: the history's records say which sessions it had, and the user
  // says which one this is, if any.
  let records: RecordSummary[] = [];
  let recordsProblem: string | undefined;
  try {
    records = await runtime.records(request.placement.historyId);
  } catch (e) {
    recordsProblem = String((e as Error)?.message ?? e);
  }
  if (records.length) {
    choosing = { placement: request.placement, records, unkept };
    post({ type: "recoverable", records });
    return;
  }
  return begin(await runtime.create(request.placement), unkept, recordsProblem);
}

/** Show `next`, and say the session is ready. */
async function begin(next: Conversation, unkept?: string, recordsProblem?: string) {
  await attach(next);
  post({
    type: "ready",
    unkept,
    galaxy: runtime!.galaxyStatus,
    galaxyProblem: runtime!.galaxyProblem,
    recordsProblem,
  });
}

/** The session the user chose to continue from the history's records, or a new one. */
async function recover(pageId: string | undefined) {
  if (!choosing) return;
  const { placement, records, unkept } = choosing;
  choosing = undefined;
  const record = records.find((r) => r.pageId === pageId);
  await begin(await runtime!.create({ ...placement, ...(record ? { record } : {}) }), unkept);
}

async function reply(id: number, work: () => Promise<unknown>) {
  try {
    post({ type: "reply", id, value: await work() });
  } catch (err) {
    post({ type: "reply", id, error: String((err as Error)?.message ?? err) });
  }
}

const failed = (err: unknown) =>
  post({ type: "failed", message: String((err as Error)?.message ?? err) });

/** Work on the attached conversation, one message at a time in the order the page sent them. */
let queue: Promise<unknown> = Promise.resolve();
function inOrder(work: () => Promise<unknown>) {
  queue = queue.then(work).catch(failed);
}

self.onmessage = ({ data }: MessageEvent<PageMessage>) => {
  if (data.type === "open") {
    // Outside the order: it may wait for another tab's lock, and "Use it here" opens again.
    open(data.request).catch(failed);
  } else if (data.type === "confirmed") {
    const waiting = confirms.get(data.id);
    confirms.delete(data.id);
    waiting?.resolve(data.approved === true);
  } else if (data.type === "stop") {
    // The conversation the user stopped; its run is released from its confirmations at once.
    const stopped = conversation;
    if (!stopped) return;
    decline(stopped.id);
    inOrder(() => runtime!.hold([stopped]));
  } else {
    inOrder(() => handle(data));
  }
};

async function handle(data: PageMessage) {
  if (data.type === "submit") {
    await runtime!.submit(conversation!, data.text);
  } else if (data.type === "reset") {
    const left = conversation!;
    const bound = await runtime!.harness.snapshot(Binding, left.id, context);
    // The conversation left behind is held: its run ends, its Galaxy work is still watched.
    decline(left.id);
    await runtime!.hold([left]);
    await attach(
      await runtime!.create({ historyId: bound?.historyId, datasetId: bound?.datasetId }),
    );
  } else if (data.type === "switch") {
    await reply(data.id, () => runtime!.switchModel(conversation!, data.config));
  } else if (data.type === "export") {
    await reply(data.id, () => runtime!.export(conversation!, data.title));
  } else if (data.type === "recover") {
    await recover(data.pageId);
  } else if (data.type === "saved") {
    await reply(data.id, () => runtime!.saved(conversation!, data.savedId, data.document));
  }
}
