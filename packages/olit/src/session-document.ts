/** The one Olit session document, stored whole in a saved Visualization's config.
 *
 * A saved Olit visualization is a restorable session: open it anywhere and the conversation
 * and its artifacts come back. The document is therefore self-contained and versioned, and
 * carries nothing that should be regenerated or that must not leave the browser.
 *
 * Fields the Charts contract already reads (`history_id`, `dataset_id`) stay at the top
 * level, because `parseIncoming` looks for them there when Galaxy reopens a saved session.
 */

import type { Artifact } from "./artifacts";
import type { Message } from "./pyodide-runner";

export const SCHEMA = 1;
/** The record block the brain refreshes each turn: stale the moment it is stored. */
const RECORD_MARKER = "<!-- olit:record -->";

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
    messages: Message[];
    artifacts: Artifact[];
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
            title: options.title || "Olit session",
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

/** The seed prompt and the brain's refreshed blocks are regenerated, never stored.
 *
 * Storing the seed would pin a restored conversation to the prompt text of the day it
 * started, so a prompt correction would never reach it.
 */
export function storableMessages(messages: Message[]): Message[] {
    return messages.filter(
        (m, i) =>
            !(i === 0 && m.role === "system") &&
            !(m.role === "system" && (m.content || "").includes(RECORD_MARKER)),
    );
}

/** The stored conversation under the seed the plugin ships today. */
export function restoreMessages(document: SessionDocument, seed: Message): Message[] {
    return [seed, ...storableMessages(document.messages || [])];
}

/** The document after one completed turn. */
export function advance(
    document: SessionDocument,
    changes: { messages: Message[]; artifacts: Artifact[]; usage?: Partial<SessionMeta["usage"]> },
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
export function noteModel(document: SessionDocument, use: { provider: string; model?: string }): void {
    const turn = document.session.turn;
    const last = document.session.models[document.session.models.length - 1];
    if (last && last.provider === use.provider && last.model === use.model) {
        last.lastTurn = turn;
        return;
    }
    document.session.models.push({ ...use, firstTurn: turn, lastTurn: turn });
}

/** Is this a document we understand? A future schema is not ours to interpret. */
export function isSessionDocument(value: unknown): value is SessionDocument {
    const d = value as SessionDocument | undefined;
    return Boolean(
        d &&
            typeof d === "object" &&
            d.olit_session === SCHEMA &&
            d.session &&
            typeof d.session.id === "string" &&
            Array.isArray(d.messages) &&
            Array.isArray(d.artifacts),
    );
}
