/** Session persistence: pi keeps session.jsonl per analysis directory; the browser gets IndexedDB. */

import { isSessionDocument, type SessionDocument } from "./session-document";

const DB_NAME = "olit";
const STORE_NAME = "sessions";
const VERSION = 1;

/** The mechanism, kept behind an interface so the policy below is testable without IndexedDB. */
export interface Store {
    get(key: string): Promise<unknown>;
    put(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<void>;
}

export function indexedDbStore(factory: IDBFactory | undefined = globalThis.indexedDB): Store | null {
    if (!factory) {
        return null;
    }
    const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
            const req = factory.open(DB_NAME, VERSION);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    const run = async (mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest) => {
        const db = await open();
        try {
            return await new Promise<any>((resolve, reject) => {
                const req = act(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        } finally {
            db.close();
        }
    };
    return {
        get: (key) => run("readonly", (s) => s.get(key)),
        put: async (key, value) => {
            await run("readwrite", (s) => s.put(value, key));
        },
        remove: async (key) => {
            await run("readwrite", (s) => s.delete(key));
        },
    };
}

/** Who the store is keyed for: pi's sessions sit in the OS user's home, so scope by Galaxy user. */
export async function galaxyUserId(
    galaxyRoot: string,
    credentials: RequestCredentials,
): Promise<string | undefined> {
    try {
        const res = await fetch(`${galaxyRoot}api/users/current`, { credentials });
        if (!res.ok) {
            return undefined;
        }
        const body = await res.json();
        return typeof body?.id === "string" && body.id ? body.id : undefined;
    } catch {
        return undefined;
    }
}

/** Documents by session id, plus a per-history pointer to the one last worked on.
 *
 * A history is a workspace, not a conversation: several sessions can run against one, so
 * identity is the session's own id. The pointer is what makes "open Olit on this history"
 * continue where you were rather than start over.
 */
export class SessionStore {
    constructor(
        private store: Store | null,
        private userId?: string,
    ) {}

    get enabled(): boolean {
        return Boolean(this.store);
    }

    // An anonymous Galaxy session has no id to scope by, so those share a browser profile.
    private get scope(): string {
        return this.userId || "anon";
    }

    async load(sessionId: string): Promise<SessionDocument | null> {
        if (!this.store) {
            return null;
        }
        try {
            const stored = await this.store.get(`session:${this.scope}:${sessionId}`);
            return isSessionDocument(stored) ? stored : null;
        } catch {
            return null;
        }
    }

    /** Persisting must never break a turn, so a failed write is dropped rather than raised. */
    async save(document: SessionDocument): Promise<void> {
        if (!this.store) {
            return;
        }
        try {
            await this.store.put(`session:${this.scope}:${document.session.id}`, document);
            if (document.history_id) {
                await this.store.put(`current:${this.scope}:${document.history_id}`, document.session.id);
            }
        } catch (e) {
            console.warn("[olit] could not persist the session", e);
        }
    }

    /** The session last worked on in this history, if this browser knows of one. */
    async current(historyId?: string): Promise<string | undefined> {
        if (!this.store || !historyId) {
            return undefined;
        }
        try {
            const stored = await this.store.get(`current:${this.scope}:${historyId}`);
            return typeof stored === "string" ? stored : undefined;
        } catch {
            return undefined;
        }
    }

    /** Forget the local copy. The saved Visualization, if any, is left alone. */
    async forget(document: SessionDocument): Promise<void> {
        if (!this.store) {
            return;
        }
        try {
            await this.store.remove(`session:${this.scope}:${document.session.id}`);
            if (document.history_id) {
                await this.store.remove(`current:${this.scope}:${document.history_id}`);
            }
        } catch (e) {
            console.warn("[olit] could not clear the session", e);
        }
    }
}
