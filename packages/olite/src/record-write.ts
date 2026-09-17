/** Shell-side read-modify-write on the record page.
 *
 * loom's poller advances the notebook itself (`persistJobUpdate`, galaxy-poller.ts): it
 * re-reads, applies the update, writes back, and retries when a concurrent writer got there
 * first. olite's record is a Galaxy Page and `update_page` replaces it wholesale, so the same
 * read-modify-write is needed here -- and for the same reason: a write that is not re-read
 * first silently drops whatever landed in between.
 *
 * Doing this shell-side rather than through the agent is the point. The model is asked to
 * merge and does so only sometimes; this cannot be talked out of happening.
 */

const MAX_ATTEMPTS = 3;

export interface RecordTarget {
    root: string;
    credentials: RequestCredentials;
    historyId: string;
}

/** Find this history's record by its deterministic slug, the way the brain does. */
export async function findRecord(t: RecordTarget): Promise<{ id: string } | null> {
    const res = await fetch(`${t.root}api/pages?limit=500`, { credentials: t.credentials });
    if (!res.ok) return null;
    const pages = await res.json();
    if (!Array.isArray(pages)) return null;
    return pages.find((p: any) => p && p.slug === `olite-${t.historyId}`) || null;
}

/**
 * Apply `edit` to the record's current content and write the result back.
 *
 * `edit` must be pure and idempotent: it is re-run against fresh content on every attempt,
 * and returning the input unchanged means "nothing to do" rather than "write this".
 */
export async function editRecord(
    t: RecordTarget,
    edit: (content: string) => string,
): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            const found = await findRecord(t);
            if (!found) return false;
            const res = await fetch(`${t.root}api/pages/${found.id}`, { credentials: t.credentials });
            if (!res.ok) return false;
            const page = (await res.json()) || {};
            // `content` is the embed-expanded render; `content_editor` is the saved source.
            const before = page.content_editor || page.content || "";
            const after = edit(before);
            if (after === before) return true;

            const put = await fetch(`${t.root}api/pages/${found.id}`, {
                method: "PUT",
                credentials: t.credentials,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: after }),
            });
            if (put.ok) return true;
            // 409 and friends mean someone else wrote first; re-read and reapply.
        } catch (e) {
            console.warn("[olite] record edit attempt failed", e);
        }
    }
    return false;
}
