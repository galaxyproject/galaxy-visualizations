/** Record submitted Galaxy work and how it ran, by the session rather than the model.
 *
 * The record is prose written by the model, so there is no block to key on -- what there is,
 * reliably, is the id: the model writes ids into the record, and the watcher knows which id
 * settled. So each job's status line sits under its id's line.
 *
 * The session owns submission and execution status only. A checkbox is the model's claim of a
 * verified result, which Galaxy's state alone neither makes nor refutes, so it is never touched.
 */

import { WHAT } from "./markers";
import type { Outcome } from "./watch";

export interface JobOutcome {
  id: string;
  kind: "job" | "invocation" | "dataset";
  state: string;
  outcome: Outcome;
}

const STATUS = "- Status:";
const SUBMITTED = `${STATUS} submitted, awaiting completion`;

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

/** The line `id`'s pending status follows, else its first mention outside a fenced block, or -1. */
function lineWithId(lines: string[], id: string): number {
  const own = lines.findIndex((l, i) => l.includes(id) && lines[i + 1]?.trimStart() === SUBMITTED);
  return own >= 0 ? own : unfencedLine(lines, id);
}

/** The status lines directly under line `at`. */
function statusAfter(lines: string[], at: number): number[] {
  const found: number[] = [];
  for (let i = at + 1; i < lines.length && lines[i].trimStart().startsWith(STATUS); i++) {
    found.push(i);
  }
  return found;
}

/**
 * Record the observed state under the line carrying `id`, in place of its pending status.
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
  const status = statusAfter(lines, at);
  if (lines[at].includes(stamp) || status.some((i) => lines[i].includes(stamp))) return content;

  const pending = status.find((i) => lines[i].trimStart() === SUBMITTED);
  const recorded = `${STATUS} ${stamp} — recorded automatically`;
  if (pending === undefined) {
    lines.splice(at + 1, 0, `${(lines[at].match(/^\s*/) || [""])[0]}${recorded}`);
  } else {
    lines[pending] = lines[pending].replace(SUBMITTED, recorded);
  }

  // The agent's "currently running" line is false once no submitted work awaits completion.
  if (!lines.some((l) => l.trimStart() === SUBMITTED)) {
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
 * Note submitted work in the record, keyed by the id the session observed: a pending status under
 * the id where the agent already wrote it, else an entry of the session's own.
 *
 * The watcher holds the correct id -- it took it from the tool result -- so the session writes
 * the entry itself rather than trusting the model to transcribe a hex string.
 */
export function noteSubmitted(
  content: string,
  w: { id: string; kind: "job" | "invocation" | "dataset" },
): string {
  const lines = content.split("\n");
  const at = unfencedLine(lines, w.id);
  if (at >= 0) {
    if (statusAfter(lines, at).length) return content;
    lines.splice(at + 1, 0, `${(lines[at].match(/^\s*/) || [""])[0]}${SUBMITTED}`);
    return lines.join("\n");
  }
  const entry = [`- ${WHAT[w.kind]} \`${w.id}\``, `  ${SUBMITTED}`];
  const kept = content.replace(/\n+$/, "").split("\n");
  const pad = kept.length && kept.at(-1)!.trim() !== "" ? ["", ...entry, ""] : [...entry, ""];
  return [...kept, ...pad].join("\n");
}
