/**
 * A conversation as one self-contained document, stored whole in a saved Visualization's config
 * and opened anywhere into a conversation of its own. The prompt is regenerated, never stored, so
 * a prompt correction reaches a reopened conversation.
 *
 * Fields the Charts contract already reads (`history_id`, `dataset_id`) stay at the top level,
 * because `parseIncoming` looks for them there when Galaxy reopens a saved session.
 */
import type { EntryDraft } from "@earendil-works/pi-durable";

export const SCHEMA = 4;

/** A model that produced part of this conversation. Carries no endpoint and no key. */
export interface ModelUse {
  provider: string;
  model?: string;
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
    models: ModelUse[];
    usage: { input: number; output: number; cost: number | null };
  };
  /** The conversation's active context, as pi-durable exports it. */
  entries: EntryDraft[];
}

/** Which models answered, in the order they first did. */
export function modelsOf(entries: readonly EntryDraft[]): ModelUse[] {
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
      (e) =>
        isObject(e) &&
        typeof e.kind === "string" &&
        (e.model === undefined || Array.isArray(e.model)),
    )
  );
}

/** Galaxy requires at least three characters and shows this in the user's visualization list. */
export function title(document: SessionDocument): string {
  const given = (document.session.title || "").trim();
  return given.length >= 3 ? given : `Olit Session (${document.session.id.slice(0, 8)})`;
}
