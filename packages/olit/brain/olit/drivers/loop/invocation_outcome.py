"""What a workflow invocation amounts to, from its jobs.

Galaxy's invocation state answers whether it could schedule and drive the workflow, not
whether the tools worked: Galaxy 26 reports `completed` for a run whose jobs errored. The
shell already applies this rule in `src/invocations.ts:settleInvocation` to tell the user;
the same rule belongs in what the agent reads, or it reports a clean run over a failed one.
"""

JOB_TERMINAL = frozenset({"ok", "error", "deleted", "discarded", "skipped", "failed"})
# One extra Galaxy call per invocation, so a long listing is not rolled up in full.
ROLLUP_LIMIT = 20


def settle(state, job_states=None):
    """The outcome `state` amounts to once its jobs are accounted for."""
    job_states = job_states or {}
    if job_states.get("error"):
        return "failed"
    active = any(count for name, count in job_states.items() if count and name not in JOB_TERMINAL)
    if state == "completed" or (not active and job_states.get("ok")):
        return "completed"
    return state


def described(invocation, job_states):
    """`invocation` with the outcome its jobs give it, alongside Galaxy's own state."""
    if not isinstance(invocation, dict):
        return invocation
    outcome = settle(invocation.get("state"), job_states)
    described = dict(invocation)
    described["job_states"] = job_states
    described["outcome"] = outcome
    if outcome == "failed":
        described["outcome_note"] = (
            "A job in this invocation failed. Galaxy's `state` describes scheduling only. "
            "Report the failure rather than the state, and read the failing dataset's "
            "get_job_details before proposing a repair."
        )
    return described
