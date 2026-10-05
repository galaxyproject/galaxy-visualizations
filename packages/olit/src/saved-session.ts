/** A saved Olit session: one Visualization whose config is the whole session document.
 *
 * Saving is deliberate, as it is for any other Galaxy visualization, so a revision marks a
 * save the user asked for rather than a conversation turn.
 */

import { segment, type Galaxy } from "./agent/galaxy";
import { isSessionDocument, title, type SessionDocument } from "./agent/saved";

export const PLUGIN_TYPE = "olit";

export interface SavedSessions {
  /** The session saved at `id`, or null if that visualization is not one of ours. */
  load(id: string): Promise<SessionDocument | null>;
  /** Create or update, returning the Visualization id. */
  save(document: SessionDocument, id?: string): Promise<string>;
}

export function savedSessions(galaxy: Galaxy): SavedSessions {
  return {
    async load(id) {
      const body = await galaxy.get(`api/visualizations/${segment(id)}`);
      const config = body?.latest_revision?.config;
      return isSessionDocument(config) ? config : null;
    },
    async save(document, id) {
      // Sharing stays off deliberately: a transcript carries far more than a chart
      // config does, so `importable`, `published` and `slug` are never set here.
      const payload = { title: title(document), config: document };
      if (id) {
        await galaxy.put(`api/visualizations/${segment(id)}`, payload);
        return id;
      }
      const created = await galaxy.post("api/visualizations", { ...payload, type: PLUGIN_TYPE });
      return created.id;
    },
  };
}

/** Tells the Galaxy host whether this session is stored on the server. */
export function reportSavedState(saved: boolean) {
  window.parent?.postMessage({ from: "galaxy-visualization", visualization_saved: saved }, "*");
}
