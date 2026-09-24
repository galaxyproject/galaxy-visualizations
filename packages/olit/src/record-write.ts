/** Shell-side read-modify-write on the record page.
 *
 * loom's poller advances the notebook itself (`persistJobUpdate`, galaxy-poller.ts): it
 * re-reads, applies the update, writes back, and retries when a concurrent writer got there
 * first. olit's record is a Galaxy Page and `update_page` replaces it wholesale, so the same
 * read-modify-write is needed here -- and for the same reason: a write that is not re-read
 * first silently drops whatever landed in between.
 *
 * Doing this shell-side rather than through the agent is the point. The model is asked to
 * merge and does so only sometimes; this cannot be talked out of happening.
 */

const MAX_ATTEMPTS = 3;

/**
 * Record writes run one at a time.
 *
 * Galaxy's page PUT has no concurrency check, so two edits that read the same content both
 * write it and the later one wins. The tab's writers -- a submitted job, a settled job, the
 * session summary -- all fire without awaiting each other, and a queue is what keeps their
 * reads and writes from interleaving.
 */
let pending: Promise<unknown> = Promise.resolve();

function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const next = pending.then(work, work);
  pending = next.catch(() => undefined);
  return next;
}

export interface RecordTarget {
  root: string;
  credentials: RequestCredentials;
  historyId: string;
}

/** Find this history's record by its deterministic slug, the way the brain does. */
export async function findRecord(t: RecordTarget): Promise<{ id: string } | null> {
  const slug = `olit-${t.historyId}`;
  // Narrow by slug rather than listing every page. The search matches substrings, so the
  // exact slug is still picked out below.
  const query = `search=${encodeURIComponent(`slug:${slug}`)}&limit=50`;
  const res = await fetch(`${t.root}api/pages?${query}`, { credentials: t.credentials });
  if (!res.ok) return null;
  const pages = await res.json();
  if (!Array.isArray(pages)) return null;
  return pages.find((p: any) => p && p.slug === slug) || null;
}

/**
 * Apply `edit` to the record's current content and write the result back.
 *
 * `edit` must be pure and idempotent: it is re-run against fresh content on every attempt,
 * and returning the input unchanged means "nothing to do" rather than "write this". It is
 * given the record's id for content that has to name the page it sits on.
 */
export function editRecord(
  t: RecordTarget,
  edit: (content: string, recordId: string) => string,
): Promise<boolean> {
  return inTurn(async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const found = await findRecord(t);
        if (!found) return false;
        const res = await fetch(`${t.root}api/pages/${found.id}`, { credentials: t.credentials });
        if (!res.ok) return false;
        const page = (await res.json()) || {};
        // `content` is the embed-expanded render; `content_editor` is the saved source.
        const before = page.content_editor || page.content || "";
        const after = edit(before, found.id);
        if (after === before) return true;

        const put = await fetch(`${t.root}api/pages/${found.id}`, {
          method: "PUT",
          credentials: t.credentials,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: after }),
        });
        if (put.ok) return true;
        // A rejected write is re-read and reapplied rather than resent as it stands.
      } catch (e) {
        console.warn("[olit] record edit attempt failed", e);
      }
    }
    return false;
  });
}
