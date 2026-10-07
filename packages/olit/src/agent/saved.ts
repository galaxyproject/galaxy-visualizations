/**
 * A conversation as one self-contained document, stored whole in a saved Visualization's config
 * and opened anywhere into a conversation of its own. The prompt is regenerated, never stored, so
 * a prompt correction reaches a reopened conversation.
 *
 * Fields the Charts contract already reads (`history_id`, `dataset_id`) stay at the top level,
 * because `parseIncoming` looks for them there when Galaxy reopens a saved session.
 */
import type { ExportedEntry } from "@earendil-works/pi-durable";

export const SCHEMA = 5;

/** A model that produced part of this conversation. Carries no endpoint and no key. */
export interface ModelUse {
  provider: string;
  model?: string;
}

/** The Olit build that wrote a document: its commit and when it was built. */
export interface Build {
  commit: string;
  built?: string;
}

/** This bundle's build stamp, when the build recorded one. */
export function thisBuild(): Build | undefined {
  const commit = process.env.olit_commit;
  if (!commit) {
    return undefined;
  }
  const built = process.env.olit_built;
  return built ? { commit, built } : { commit };
}

export interface SessionDocument {
  olit_session: number;
  history_id?: string;
  dataset_id?: string;
  session: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    turn: number;
    recordPageId?: string;
    /** The build that saved it, so a session can be traced to the code that ran it. */
    build?: Build;
    models: ModelUse[];
    usage: { input: number; output: number; cost: number | null };
  };
  /** The conversation's active context, as pi-durable exports it. */
  entries: ExportedEntry[];
}

/** Which models answered, in the order they first did. */
export function modelsOf(entries: readonly ExportedEntry[]): ModelUse[] {
  const seen = new Map<string, ModelUse>();
  for (const e of entries) {
    for (const m of e.model ?? []) {
      if (m.role === "assistant" && !seen.has(`${m.provider}/${m.model}`)) {
        seen.set(`${m.provider}/${m.model}`, { provider: m.provider, model: m.model });
      }
    }
  }
  return [...seen.values()];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const ENCODED_ID = /^[0-9a-f]+$/;

/** A head marker naming an earlier entry of the document, by its position. */
const startsEarlier = (head: unknown, at: number) =>
  isObject(head) &&
  typeof head.entry === "number" &&
  Number.isInteger(head.entry) &&
  head.entry >= 0 &&
  head.entry < at;

/** Is this a document we understand? Another schema is not ours to interpret. */
export function isSessionDocument(value: unknown): value is SessionDocument {
  if (!isObject(value) || value.olit_session !== SCHEMA || !isObject(value.session)) {
    return false;
  }
  const { session, entries } = value;
  return (
    typeof session.id === "string" &&
    typeof session.updatedAt === "string" &&
    (session.recordPageId === undefined ||
      (typeof session.recordPageId === "string" && ENCODED_ID.test(session.recordPageId))) &&
    Array.isArray(entries) &&
    entries.every(
      (e, i) =>
        isObject(e) &&
        typeof e.kind === "string" &&
        (e.model === undefined || Array.isArray(e.model)) &&
        // A head marker starts the context at itself or at an earlier entry of this document.
        (e.head === undefined || e.head === "self" || startsEarlier(e.head, i)),
    )
  );
}

/** Galaxy requires at least three characters and shows this in the user's visualization list. */
export function title(document: SessionDocument): string {
  const given = (document.session.title || "").trim();
  return given.length >= 3 ? given : `Olit Session (${document.session.id.slice(0, 8)})`;
}

/** A conversation's usage across its models; no cost when no model reported one, not zero. */
export function usageTotals(
  totals: Array<{ input?: number; output?: number; cost?: { total?: number } }>,
) {
  return {
    input: totals.reduce((n, u) => n + (u.input ?? 0), 0),
    output: totals.reduce((n, u) => n + (u.output ?? 0), 0),
    cost: totals.some((u) => u.cost?.total)
      ? totals.reduce((n, u) => n + (u.cost?.total ?? 0), 0)
      : null,
  };
}
