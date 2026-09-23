/** Session persistence: pi keeps session.jsonl per analysis directory; the browser gets IndexedDB. */

import type { Artifact } from "./artifacts";
import type { Message } from "./pyodide-runner";

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

/** One stored conversation per user and history, as pi keys a session by home plus directory. */
export class SessionMemory {
    constructor(
        private store: Store | null,
        private historyId?: string,
        private userId?: string,
    ) {}

    /** No history means no session to key on: the eval harness and the dev page keep none. */
    get enabled(): boolean {
        return Boolean(this.store && this.historyId);
    }

    // An anonymous Galaxy session has no id to scope by, so those still share a browser profile.
    private get key(): string {
        return `session:${this.userId || "anon"}:${this.historyId}`;
    }

    /** Kept under its own key so a stored conversation from before this stays readable. */
    private get artifactKey(): string {
        return `artifacts:${this.userId || "anon"}:${this.historyId}`;
    }

    async load(): Promise<Message[] | null> {
        if (!this.enabled) {
            return null;
        }
        try {
            const stored = await this.store!.get(this.key);
            return Array.isArray(stored) && stored.every(isMessage) && stored.length ? stored : null;
        } catch {
            return null;
        }
    }

    /**
     * What earlier turns produced, so `{{artifact}}` still resolves after a reload.
     *
     * Switching provider applies the new choice by reloading, so anything held only in
     * memory is gone by the time the next turn asks for it -- which is the whole reason
     * the transcript is persisted too.
     */
    async loadArtifacts(): Promise<Artifact[]> {
        if (!this.enabled) {
            return [];
        }
        try {
            const stored = await this.store!.get(this.artifactKey);
            return Array.isArray(stored) && stored.every(isArtifact) ? (stored as Artifact[]) : [];
        } catch {
            return [];
        }
    }

    async saveArtifacts(artifacts: Artifact[]): Promise<void> {
        if (!this.enabled) {
            return;
        }
        try {
            await this.store!.put(this.artifactKey, artifacts);
        } catch (e) {
            console.warn("[olit] could not persist the artifacts", e);
        }
    }

    /** Persisting must never break a turn, so a failed write is dropped rather than raised. */
    async save(messages: Message[]): Promise<void> {
        if (!this.enabled || !hasConversation(messages)) {
            return;
        }
        try {
            await this.store!.put(this.key, messages);
        } catch (e) {
            console.warn("[olit] could not persist the session", e);
        }
    }

    async clear(): Promise<void> {
        if (!this.enabled) {
            return;
        }
        try {
            await this.store!.remove(this.key);
            await this.store!.remove(this.artifactKey);
        } catch (e) {
            console.warn("[olit] could not clear the session", e);
        }
    }
}

function isArtifact(a: unknown): a is Artifact {
    return Boolean(a && typeof a === "object" && typeof (a as Artifact).kind === "string");
}

function isMessage(m: unknown): m is Message {
    return Boolean(m && typeof m === "object" && typeof (m as Message).role === "string");
}

/** A seeded system prompt on its own is not a conversation worth resuming. */
function hasConversation(messages: Message[]): boolean {
    return Array.isArray(messages) && messages.some((m) => isMessage(m) && m.role !== "system");
}
