/** A saved Olit session: one Visualization whose config is the whole session document.
 *
 * Saving is deliberate, as it is for any other Galaxy visualization, so a revision marks a
 * save the user asked for rather than a conversation turn.
 */

import { isSessionDocument, type SessionDocument } from "./session-document";

export const PLUGIN_TYPE = "olit";

export interface SavedSessions {
    /** The session saved at `id`, or null if that visualization is not one of ours. */
    load(id: string): Promise<SessionDocument | null>;
    /** Create or update, returning the Visualization id. */
    save(document: SessionDocument, id?: string): Promise<string>;
}

export function savedSessions(root: string, credentials: RequestCredentials): SavedSessions {
    const call = async (path: string, init?: RequestInit) => {
        const res = await fetch(`${root}api/visualizations${path}`, {
            credentials,
            headers: { "Content-Type": "application/json" },
            ...init,
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${await res.text()}`);
        }
        return res.json();
    };
    return {
        async load(id) {
            const body = await call(`/${id}`);
            const config = body?.latest_revision?.config;
            return isSessionDocument(config) ? config : null;
        },
        async save(document, id) {
            // Sharing stays off deliberately: a transcript carries far more than a chart
            // config does, so `importable`, `published` and `slug` are never set here.
            const payload = { title: title(document), config: document };
            if (id) {
                await call(`/${id}`, { method: "PUT", body: JSON.stringify(payload) });
                return id;
            }
            const created = await call("", {
                method: "POST",
                body: JSON.stringify({ ...payload, type: PLUGIN_TYPE }),
            });
            return created.id;
        },
    };
}

/** Tells the Galaxy host whether this session is stored on the server. */
export function reportSavedState(saved: boolean) {
    window.parent?.postMessage({ from: "galaxy-visualization", visualization_saved: saved }, "*");
}

/** Galaxy requires at least three characters and shows this in the user's visualization list. */
export function title(document: SessionDocument): string {
    const given = (document.session.title || "").trim();
    return given.length >= 3 ? given : `Olit session ${document.session.id.slice(0, 8)}`;
}
