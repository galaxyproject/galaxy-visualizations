/** Record the outcome of submitted Galaxy work, shell-side.
 *
 * loom's `applyJobPollUpdate` advances the notebook block for a finished job; the checkbox
 * flips and the status line updates without the agent being asked. olit's record is prose
 * written by the model, so there is no block to key on -- what there is, reliably, is the
 * id: the model writes ids into the record, and the watcher knows which id settled.
 *
 * So the update is anchored on the id's line. Anything the agent wrote stays; only status
 * is appended, and only once.
 */

const DONE = "- [x]";
const PENDING = "- [ ]";
const FAILED = "- [!]";

export interface JobOutcome {
    id: string;
    kind: "job" | "invocation" | "dataset";
    state: string;
    failed: boolean;
}

/** The line index whose text mentions `id`, or -1. */
function lineWithId(lines: string[], id: string): number {
    return lines.findIndex((l) => l.includes(id));
}

/**
 * Mark the step carrying `id` as finished and append the observed state.
 *
 * Pure and idempotent -- `editRecord` re-runs it against fresh content on every retry, and an
 * unchanged return means the record already says this.
 */
export function applyJobOutcome(content: string, outcome: JobOutcome): string {
    if (!content || !content.includes(outcome.id)) return content;
    const lines = content.split("\n");
    const at = lineWithId(lines, outcome.id);
    if (at < 0) return content;

    const stamp = `${outcome.failed ? "failed" : "finished"} (${outcome.state})`;
    // Already recorded: do not append a second time.
    if (lines[at].includes(stamp)) return content;
    for (let i = at; i < Math.min(at + 4, lines.length); i++) {
        if (lines[i].includes(stamp)) return content;
    }

    // Walk back to the checklist item this line belongs to; sub-bullets are indented.
    let step = at;
    while (step >= 0 && !lines[step].trimStart().startsWith(PENDING) && !lines[step].trimStart().startsWith(DONE)) {
        step -= 1;
    }
    if (step >= 0) {
        const marker = lines[step].trimStart();
        if (marker.startsWith(PENDING) && !outcome.failed) {
            lines[step] = lines[step].replace(PENDING, DONE);
        } else if (marker.startsWith(DONE) && outcome.failed) {
            // Verified-complete for a job Galaxy says failed is a false claim. A step still
            // pending is left alone: it was never claimed, and a retry is legitimate.
            lines[step] = lines[step].replace(DONE, FAILED);
        }
    }

    const indent = (lines[at].match(/^\s*/) || [""])[0];
    lines.splice(at + 1, 0, `${indent}- Status: ${stamp} — recorded automatically`);

    // The agent's "currently running" line is false once everything it covered has settled.
    const stillPending = lines.some((l) => l.trimStart().startsWith(PENDING));
    if (!stillPending) {
        return lines
            .map((l) => (/^\*Submitted jobs are currently running\.\*$/.test(l.trim()) ? "*All submitted jobs have finished.*" : l))
            .join("\n");
    }
    return lines.join("\n");
}


/**
 * Note submitted work in the record, keyed by the id the shell observed.
 *
 * loom has `galaxy_invocation_record({ invocationId, ... })`: the agent hands the poller the
 * id and the poller owns the entry from then on. olit's watcher already holds the correct
 * id -- it took it from the tool result -- so the shell writes the entry itself rather than
 * trusting the model to transcribe a hex string. A live run wrote the invocation's `uuid`
 * where Galaxy's `id` was needed, which left the record unmatchable and the poller unable to
 * advance anything.
 */
/** What to call each kind in the record and the chat. */
export const WHAT = {
    job: "Galaxy job",
    invocation: "Workflow invocation",
    dataset: "Galaxy dataset",
} as const;

export function noteSubmitted(content: string, w: { id: string; kind: "job" | "invocation" | "dataset" }): string {
    if (content.includes(w.id)) return content;
    const what = WHAT[w.kind];
    const entry = `- [ ] ${what} \`${w.id}\` — submitted, awaiting completion`;
    const lines = content.split("\n");

    // Keep the session block last; it is the shell's own footer.
    const fence = lines.findIndex((l) => l.trim().startsWith("```olit-session"));
    const at = fence < 0 ? lines.length : fence;
    const pad = at > 0 && lines[at - 1].trim() !== "" ? ["", entry, ""] : [entry, ""];
    lines.splice(at, 0, ...pad);
    return lines.join("\n");
}
