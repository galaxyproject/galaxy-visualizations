/** Record the outcome of submitted Galaxy work, by the session rather than the model.
 *
 * loom's `applyJobPollUpdate` advances the notebook block for a finished job; the checkbox
 * flips and the status line updates without the agent being asked. olit's record is prose
 * written by the model, so there is no block to key on -- what there is, reliably, is the
 * id: the model writes ids into the record, and the watcher knows which id settled.
 *
 * So the update is anchored on the id's line. Anything the agent wrote stays; only status
 * is appended, and only once.
 */

import { WHAT } from "./markers";
import type { Outcome } from "./watch";

const DONE = "- [x]";
const PENDING = "- [ ]";
const FAILED = "- [!]";

export interface JobOutcome {
  id: string;
  kind: "job" | "invocation" | "dataset";
  state: string;
  outcome: Outcome;
}

const SUBMITTED = "submitted, awaiting completion";

/** The status line each outcome leaves in the record. */
const STAMP: Record<Outcome, (state: string) => string> = {
  completed: (state) => `finished (${state})`,
  failed: (state) => `failed (${state})`,
  cancelled: () => "cancelled",
  skipped: () => "skipped",
  paused: () => "paused, waiting on an input that failed",
  unreadable: (state) => `no longer shown by Galaxy (${state})`,
};

function unfencedLine(lines: string[], id: string): number {
  let fenced = false;
  return lines.findIndex((l) => {
    if (l.trimStart().startsWith("```")) fenced = !fenced;
    return !fenced && l.includes(id);
  });
}

/** The session's own entry for `id`, else its first mention outside a fenced block, or -1. */
function lineWithId(lines: string[], id: string): number {
  const own = lines.findIndex((l) => l.includes(id) && l.includes(SUBMITTED));
  return own >= 0 ? own : unfencedLine(lines, id);
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

  const stamp = STAMP[outcome.outcome](outcome.state);
  // Already recorded: do not append a second time.
  if (lines[at].includes(stamp)) return content;
  for (let i = at; i < Math.min(at + 4, lines.length); i++) {
    if (lines[i].includes(stamp)) return content;
  }

  // Walk back to the checklist item this line belongs to; sub-bullets are indented.
  let step = at;
  while (
    step >= 0 &&
    !lines[step].trimStart().startsWith(PENDING) &&
    !lines[step].trimStart().startsWith(DONE)
  ) {
    step = step < at && /^\s*($|#)/.test(lines[step]) ? -1 : step - 1;
  }
  // Only a completed or failed run settles the step; any other leaves its marker as the agent
  // wrote it, and the status line below says what happened.
  if (step >= 0) {
    const marker = lines[step].trimStart();
    if (marker.startsWith(PENDING) && outcome.outcome === "completed") {
      lines[step] = lines[step].replace(PENDING, DONE);
    } else if (marker.startsWith(DONE) && outcome.outcome === "failed") {
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
      .map((l) =>
        /^\*Submitted jobs are currently running\.\*$/.test(l.trim())
          ? "*All submitted jobs have finished.*"
          : l,
      )
      .join("\n");
  }
  return lines.join("\n");
}

/**
 * Note submitted work in the record, keyed by the id the session observed.
 *
 * loom has `galaxy_invocation_record({ invocationId, ... })`: the agent hands the poller the
 * id and the poller owns the entry from then on. olit's watcher already holds the correct
 * id -- it took it from the tool result -- so the session writes the entry itself rather than
 * trusting the model to transcribe a hex string. A live run wrote the invocation's `uuid`
 * where Galaxy's `id` was needed, which left the record unmatchable and the poller unable to
 * advance anything.
 */
export function noteSubmitted(
  content: string,
  w: { id: string; kind: "job" | "invocation" | "dataset" },
): string {
  if (unfencedLine(content.split("\n"), w.id) >= 0) return content;
  const what = WHAT[w.kind];
  const entry = `- [ ] ${what} \`${w.id}\` — ${SUBMITTED}`;
  const lines = content.replace(/\n+$/, "").split("\n");
  const pad = lines.length && lines.at(-1)!.trim() !== "" ? ["", entry, ""] : [entry, ""];
  return [...lines, ...pad].join("\n");
}
