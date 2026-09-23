"""What a workflow invocation amounts to, from its jobs.

Galaxy's invocation state answers whether it could schedule and drive the workflow, not
whether the tools worked: Galaxy 26 reports `completed` for a run whose jobs errored. The
shell applies this rule in `src/invocations.ts:settleInvocation` to tell the user; the same
rule belongs in what the agent reads, or it reports a clean run over a failed one.

The states follow loom's `checkInvocations` (`extensions/loom/tools.ts`), including its two
questions: has Galaxy stopped handing out steps, and is any job it handed out still moving.
A run with one errored job and another still running is failing, not failed.
"""

# loom's FAILED_JOB_STATES: ended some way other than working.
FAILED_JOB_STATES = frozenset({"error", "failed", "deleted"})
# Over, so nothing will move them again. `paused`, `upload` and `setting_metadata` are not.
TERMINAL_JOB_STATES = frozenset({"ok", "skipped", "stopped"}) | FAILED_JOB_STATES
# Galaxy has stopped scheduling steps; `completed` is Galaxy 26's own name for the settled case.
SCHEDULING_DONE = frozenset({"scheduled", "cancelled", "failed", "completed"})
# One extra Galaxy call per invocation, so a long listing is not rolled up in full.
ROLLUP_LIMIT = 20


def _counted(job_states, wanted):
    return sum(n for state, n in (job_states or {}).items() if n and state in wanted)


def _active(job_states):
    return sum(n for state, n in (job_states or {}).items() if n and state not in TERMINAL_JOB_STATES)


def settle(state, job_states=None):
    """The outcome `state` amounts to once its jobs are accounted for."""
    job_states = job_states or {}
    failed = _counted(job_states, FAILED_JOB_STATES)
    if state not in SCHEDULING_DONE or _active(job_states):
        return "failing" if failed else state
    # loom folds a cancelled run into `failed` because its record has no third word;
    # a tool result has room to say what actually happened.
    if state == "cancelled":
        return "cancelled"
    if failed or state == "failed":
        return "failed"
    return "completed" if job_states.get("ok") else state


NOTES = {
    "failed": (
        "A job in this invocation failed. Galaxy's `state` describes scheduling only. "
        "Report the failure rather than the state, and read the failing dataset's "
        "get_job_details before proposing a repair."
    ),
    "failing": (
        "A job in this invocation failed while others are still running. The run is not "
        "over, so do not report it as finished, and do not repair it until it settles."
    ),
    "cancelled": "This invocation was cancelled, so its outputs are incomplete.",
}


def described(invocation, job_states):
    """`invocation` with the outcome its jobs give it, alongside Galaxy's own state."""
    if not isinstance(invocation, dict):
        return invocation
    outcome = settle(invocation.get("state"), job_states)
    out = dict(invocation)
    out["job_states"] = job_states
    out["outcome"] = outcome
    if outcome in NOTES:
        out["outcome_note"] = NOTES[outcome]
    return out
