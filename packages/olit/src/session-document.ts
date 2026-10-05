/** The one Olit session document, stored whole in a saved Visualization's config.
 *
 * A saved Olit visualization is a restorable session: open it anywhere and the conversation
 * and its artifacts come back. The document is therefore self-contained and versioned, and
 * carries nothing that should be regenerated or that must not leave the browser.
 *
 * Fields the Charts contract already reads (`history_id`, `dataset_id`) stay at the top
 * level, because `parseIncoming` looks for them there when Galaxy reopens a saved session.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import type { Artifact } from "./artifacts";
import { isRecordUpdate } from "./agent/sections";
import type { Watched } from "./agent/watch";

/** 2: pi's own messages. Earlier documents are not read. */
export const SCHEMA = 2;

export interface SessionMeta {
  /** Stable across reloads and saves. Owns this session's block in the record Page. */
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turn: number;
  recordPageId?: string;
  /** Which models produced this conversation. Provenance only: never restored as config. */
  models: ModelUse[];
  usage: { input: number; output: number; cost: number | null };
}

/** A model that produced part of this conversation. Carries no endpoint and no key. */
export interface ModelUse {
  provider: string;
  model?: string;
  firstTurn: number;
  lastTurn: number;
}

export interface SessionDocument {
  olit_session: number;
  history_id?: string;
  dataset_id?: string;
  session: SessionMeta;
  messages: AgentMessage[];
  artifacts: Artifact[];
  /** Galaxy work still unfinished, so a reloaded page keeps watching it. */
  watching?: Watched[];
}

const uuid = () => globalThis.crypto?.randomUUID?.() || `s-${Date.now()}-${Math.random()}`;

export function newDocument(options: {
  historyId?: string;
  datasetId?: string;
  title?: string;
}): SessionDocument {
  const now = new Date().toISOString();
  return {
    olit_session: SCHEMA,
    history_id: options.historyId,
    dataset_id: options.datasetId,
    session: {
      id: uuid(),
      // Left empty so `title()` can name it; any default here is >= 3 chars and wins.
      title: options.title || "",
      createdAt: now,
      updatedAt: now,
      turn: 0,
      models: [],
      usage: { input: 0, output: 0, cost: null },
    },
    messages: [],
    artifacts: [],
  };
}

/** The seed prompt and the session's refreshed sections are regenerated, never stored.
 *
 * Storing the seed would pin a restored conversation to the prompt text of the day it
 * started, so a prompt correction would never reach it.
 */
export function storableMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter(
    (m, i) =>
      !(i === 0 && m.role === "system") &&
      // The record section the session refreshes each turn: stale the moment it is stored.
      !isRecordUpdate(m),
  );
}

/** The stored conversation under the seed the plugin ships today. */
export function restoreMessages(document: SessionDocument, seed: AgentMessage): AgentMessage[] {
  return [seed, ...storableMessages(document.messages || [])];
}

/** The document after one completed turn. */
export function advance(
  document: SessionDocument,
  changes: {
    messages: AgentMessage[];
    artifacts: Artifact[];
    usage?: Partial<SessionMeta["usage"]>;
  },
): SessionDocument {
  const previous = document.session;
  return {
    ...document,
    session: {
      ...previous,
      turn: previous.turn + 1,
      updatedAt: new Date().toISOString(),
      usage: {
        input: previous.usage.input + (changes.usage?.input || 0),
        output: previous.usage.output + (changes.usage?.output || 0),
        cost:
          changes.usage?.cost == null && previous.usage.cost == null
            ? null
            : (previous.usage.cost || 0) + (changes.usage?.cost || 0),
      },
    },
    messages: storableMessages(changes.messages),
    artifacts: changes.artifacts,
  };
}

/** Note which model produced this turn. Provenance: the runtime config comes from the browser. */
export function noteModel(
  document: SessionDocument,
  use: { provider: string; model?: string },
): void {
  const turn = document.session.turn;
  const last = document.session.models[document.session.models.length - 1];
  if (last && last.provider === use.provider && last.model === use.model) {
    last.lastTurn = turn;
    return;
  }
  document.session.models.push({ ...use, firstTurn: turn, lastTurn: turn });
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const ENCODED_ID = /^[0-9a-f]+$/;

/** Is this a document we understand? A future schema is not ours to interpret. */
export function isSessionDocument(value: unknown): value is SessionDocument {
  if (!isObject(value) || value.olit_session !== SCHEMA || !isObject(value.session)) {
    return false;
  }
  const { session, messages, artifacts, watching } = value;
  return (
    typeof session.id === "string" &&
    typeof session.turn === "number" &&
    Array.isArray(session.models) &&
    isObject(session.usage) &&
    (session.recordPageId === undefined ||
      (typeof session.recordPageId === "string" && ENCODED_ID.test(session.recordPageId))) &&
    Array.isArray(messages) &&
    messages.every((m) => isObject(m) && typeof m.role === "string") &&
    Array.isArray(artifacts) &&
    artifacts.every((a) => isObject(a) && typeof a.kind === "string") &&
    (watching === undefined ||
      (Array.isArray(watching) &&
        watching.every(
          (w) => isObject(w) && typeof w.kind === "string" && typeof w.id === "string",
        )))
  );
}
