/** A saved Olit session: one Visualization whose config is the whole session document.
 *
 * Saving is deliberate, as it is for any other Galaxy visualization, so a revision marks a
 * save the user asked for rather than a conversation turn.
 */

import { segment, type Galaxy } from "./agent/galaxy";
import { isSessionDocument, title, type SessionDocument } from "./agent/saved";

export const PLUGIN_TYPE = "olit";

/** A saved session the signed-in user does not own, which Galaxy may still show them. */
export class NotYours extends Error {}

export interface SavedSessions {
  /**
   * The session saved at `id`, or null if that visualization is not one of ours. Throws
   * `NotYours` unless the signed-in user owns it.
   */
  load(id: string): Promise<SessionDocument | null>;
  /** Create or update, returning the Visualization id. */
  save(document: SessionDocument, id?: string): Promise<string>;
}

export function savedSessions(galaxy: Galaxy): SavedSessions {
  return {
    async load(id) {
      const [body, user] = await Promise.all([
        galaxy.get(`api/visualizations/${segment(id)}`),
        galaxy.get("api/users/current"),
      ]);
      // Galaxy also shows a visualization shared with the user or open to anyone with its link.
      const owner = body?.user_id;
      if (typeof owner !== "string" || !owner || owner !== user?.id) {
        throw new NotYours("it was not saved by the signed-in user");
      }
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
