export type JobStates = Record<string, number>;

const FAILED_JOB_STATES = new Set(["error", "failed", "deleted"]);
const TERMINAL_JOB_STATES = new Set(["ok", "skipped", "stopped", ...FAILED_JOB_STATES]);
const SCHEDULING_DONE = new Set(["scheduled", "cancelled", "failed", "completed"]);
/** Invocations in a listing that are rolled up, one Galaxy call each. */
export const ROLLUP_LIMIT = 20;

const counted = (jobStates: JobStates, wanted: (state: string) => boolean) =>
  Object.entries(jobStates).reduce((sum, [state, n]) => (n && wanted(state) ? sum + n : sum), 0);

/** The outcome `state` amounts to once its jobs are accounted for. */
export function settle(state: string | undefined, jobStates: JobStates = {}): string | undefined {
  const failed = counted(jobStates, (s) => FAILED_JOB_STATES.has(s));
  const active = counted(jobStates, (s) => !TERMINAL_JOB_STATES.has(s));
  if (!SCHEDULING_DONE.has(state ?? "") || active) {
    return failed ? "failing" : state;
  }
  if (state === "cancelled") {
    return "cancelled";
  }
  if (failed || state === "failed") {
    return "failed";
  }
  return jobStates.ok ? "completed" : state;
}

const NOTES: Record<string, string> = {
  failed:
    "A job in this invocation failed. Galaxy's `state` describes scheduling only. " +
    "Report the failure rather than the state, and read the failing dataset's " +
    "get_job_details before proposing a repair.",
  failing:
    "A job in this invocation failed while others are still running. The run is not " +
    "over, so do not report it as finished, and do not repair it until it settles.",
  cancelled: "This invocation was cancelled, so its outputs are incomplete.",
};

/** `invocation` with the outcome its jobs give it, alongside Galaxy's own state. */
export function described(invocation: unknown, jobStates: JobStates): unknown {
  if (!invocation || typeof invocation !== "object" || Array.isArray(invocation)) {
    return invocation;
  }
  const record = invocation as Record<string, unknown>;
  const outcome = settle(record.state as string | undefined, jobStates);
  const out: Record<string, unknown> = { ...record, job_states: jobStates, outcome };
  if (outcome && outcome in NOTES) {
    out.outcome_note = NOTES[outcome];
  }
  return out;
}
