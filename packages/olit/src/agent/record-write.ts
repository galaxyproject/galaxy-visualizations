/** The session's read-modify-write on the record page.
 *
 * loom's poller advances the notebook itself (`persistJobUpdate`, galaxy-poller.ts): it
 * re-reads, applies the update, writes back, and retries when a concurrent writer got there
 * first. olit's record is a Galaxy Page and `update_page` replaces it wholesale, so the same
 * read-modify-write is needed here -- and for the same reason: a write that is not re-read
 * first silently drops whatever landed in between.
 *
 * The session does this rather than the model. The model is asked to merge and does so only
 * sometimes; this cannot be talked out of happening.
 */

import { contentHash } from "@galaxyproject/galaxy-ops/browser";

import { HttpError, segment, type Galaxy } from "./galaxy";
import { pageBody } from "./page-edit";

const MAX_ATTEMPTS = 3;

/**
 * Record writes run one at a time.
 *
 * Galaxy's page PUT has no concurrency check, so two edits that read the same content both
 * write it and the later one wins. The session's writers -- a submitted job, a settled job, the
 * session summary, the agent's own update_page -- all fire without awaiting each other, and a
 * queue is what keeps their reads and writes from interleaving.
 */
let pending: Promise<unknown> = Promise.resolve();

export function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = pending.then(work, work);
  pending = next.catch(() => undefined);
  return next;
}

/** Page content a session's agent was shown, by session, page and the content_hash shown with it. */
const shown = new Map<string, string>();
const SHOWN_KEPT = 20;
const shownKey = (sessionId: string, pageId: string, hash: string) =>
  JSON.stringify([sessionId, pageId, hash]);

/** Keep `content` as this session's agent read page `pageId`; a session without an id keeps none. */
export function remember(sessionId: string | undefined, pageId: string, content: string): void {
  if (!sessionId) return;
  const key = shownKey(sessionId, pageId, contentHash({ content_editor: content }));
  shown.delete(key);
  shown.set(key, content);
  if (shown.size > SHOWN_KEPT) shown.delete(shown.keys().next().value!);
}

/** What this session's agent read of page `pageId` under `hash`, if it read it. */
export const shownAs = (
  sessionId: string | undefined,
  pageId: string,
  hash: string,
): string | undefined => (sessionId ? shown.get(shownKey(sessionId, pageId, hash)) : undefined);

/** The text of every section headed by `heading`, split as galaxy-ops' section edit splits it. */
export function sectionsHeaded(content: string, heading: string): string[] {
  const out: string[] = [];
  let inside = false;
  content.split("\n").forEach((line, i) => {
    const opens = /^#{1,6}\s/.test(line);
    if (opens || i === 0) {
      inside = opens && line === heading;
      if (inside) out.push("");
    }
    if (inside) out[out.length - 1] += `${line}\n`;
  });
  return out;
}

export interface RecordTarget {
  galaxy: Galaxy;
  /** The session's record page, which the agent created and named; none yet means no edit. */
  pageId?: string;
}

/**
 * Apply `edit` to the record's current content and write the result back. Resolves to why the
 * record could not be updated, or undefined once it holds the edit (or there is no record yet).
 *
 * `edit` must be pure and idempotent: it is re-run against fresh content on every attempt,
 * and returning the input unchanged means "nothing to do" rather than "write this". It is
 * given the record's id for content that has to name the page it sits on.
 */
export function editRecord(
  { galaxy, pageId }: RecordTarget,
  edit: (content: string, recordId: string) => string,
): Promise<string | undefined> {
  return serialized(async () => {
    if (!pageId) {
      return undefined;
    }
    const path = `api/pages/${segment(pageId)}`;
    let last = "";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let before: string;
      try {
        before = pageBody((await galaxy.get(path)) || {});
      } catch (e) {
        // A page Galaxy refuses to show is not one a retry will find.
        if (e instanceof HttpError) {
          return `Galaxy would not show record page ${pageId} (${e.message})`;
        }
        last = String((e as Error)?.message ?? e);
        continue;
      }
      const after = edit(before, pageId);
      if (after === before) {
        return undefined;
      }
      try {
        await galaxy.put(path, { content: after, edit_source: "agent" });
        return undefined;
      } catch (e) {
        // A rejected write is re-read and reapplied rather than resent as it stands.
        last = String((e as Error)?.message ?? e);
      }
    }
    return `record page ${pageId} could not be written (${last})`;
  });
}
