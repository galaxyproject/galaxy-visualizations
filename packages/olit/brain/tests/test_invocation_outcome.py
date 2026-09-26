"""An invocation is judged by its jobs, not by whether Galaxy could schedule it."""

import asyncio
import json

from olit.drivers.loop import invocation_outcome
from olit.drivers.loop.tools import ToolSurface

from .fakes import FakeSubstrate

# The shape Galaxy returned for the staged run this exists for.
SCHEDULED = {"id": "i1", "state": "completed", "history_id": "h1"}


def test_an_errored_job_fails_the_invocation():
    assert invocation_outcome.settle("completed", {"error": 1, "ok": 1}) == "failed"
    assert invocation_outcome.settle("scheduled", {"error": 1}) == "failed"


def test_a_run_whose_jobs_all_succeeded_is_complete():
    assert invocation_outcome.settle("scheduled", {"ok": 2}) == "completed"
    assert invocation_outcome.settle("completed", {"ok": 2}) == "completed"


def test_a_run_still_working_keeps_galaxy_s_state():
    assert invocation_outcome.settle("scheduled", {"running": 1, "ok": 1}) == "scheduled"
    assert invocation_outcome.settle("new", {}) == "new"


def test_a_run_still_scheduling_is_not_judged_yet():
    """loom's second question: has Galaxy stopped handing out steps?"""
    assert invocation_outcome.settle("new", {"ok": 1}) == "new"
    assert invocation_outcome.settle("cancelling", {"ok": 1}) == "cancelling"


def test_an_error_beside_a_running_job_is_failing_rather_than_failed():
    """A run whose other steps are still going is not over, so it cannot be reported as over."""
    assert invocation_outcome.settle("scheduled", {"error": 1, "running": 1}) == "failing"
    assert invocation_outcome.settle("scheduled", {"error": 1, "paused": 1}) == "failing"


def test_every_state_loom_counts_as_a_failure_counts_here():
    for state in ("error", "failed", "deleted"):
        assert invocation_outcome.settle("completed", {state: 1}) == "failed", state


def test_a_state_that_merely_ended_is_not_a_failure():
    assert invocation_outcome.settle("scheduled", {"ok": 1, "skipped": 1}) == "completed"


def test_a_cancelled_run_is_reported_as_cancelled():
    """loom folds this into `failed`; a tool result has room to say what happened."""
    assert invocation_outcome.settle("cancelled", {}) == "cancelled"
    assert invocation_outcome.settle("cancelled", {"ok": 1}) == "cancelled"


def test_galaxy_failing_to_schedule_is_a_failure_with_no_failed_job():
    assert invocation_outcome.settle("failed", {}) == "failed"


def test_a_failed_outcome_says_what_to_do_next():
    out = invocation_outcome.described(SCHEDULED, {"error": 1})

    assert out["outcome"] == "failed"
    assert out["job_states"] == {"error": 1}
    assert "get_job_details" in out["outcome_note"]
    # Galaxy's own answer is kept: it is the truth about scheduling.
    assert out["state"] == "completed"


def test_a_failing_run_is_told_not_to_repair_it_yet():
    out = invocation_outcome.described(dict(SCHEDULED, state="scheduled"), {"error": 1, "running": 1})

    assert out["outcome"] == "failing"
    assert "not over" in out["outcome_note"]


def test_a_healthy_run_carries_no_note():
    out = invocation_outcome.described(SCHEDULED, {"ok": 2})

    assert out["outcome"] == "completed"
    assert "outcome_note" not in out


class InvocationGalaxy:
    """Galaxy 26: the invocation reads `completed` while a job inside it errored."""

    def __init__(self, listed=None):
        self.listed = listed
        self.paths = []

    async def get(self, path):
        self.paths.append(path)
        if path.endswith("jobs_summary"):
            return {"states": {"error": 1, "ok": 1}}
        if self.listed is not None and path.startswith("api/invocations?"):
            return self.listed
        return dict(SCHEDULED)


def _dispatch(galaxy, args):
    substrate = FakeSubstrate(galaxy=galaxy, capabilities=("llm", "local", "read"))
    answer = json.loads(asyncio.run(ToolSurface(substrate).dispatch("get_invocations", args)).text)
    return answer["data"]


def test_one_invocation_is_rolled_up():
    galaxy = InvocationGalaxy()
    out = _dispatch(galaxy, {"invocation_id": "i1"})

    assert out["outcome"] == "failed"
    assert any(p.endswith("jobs_summary") for p in galaxy.paths)


def test_a_listing_is_rolled_up_too():
    galaxy = InvocationGalaxy(listed=[dict(SCHEDULED), dict(SCHEDULED, id="i2")])
    out = _dispatch(galaxy, {"history_id": "h1"})

    assert [i["outcome"] for i in out] == ["failed", "failed"]


def test_a_long_listing_stops_rolling_up():
    many = [dict(SCHEDULED, id=f"i{n}") for n in range(invocation_outcome.ROLLUP_LIMIT + 3)]
    galaxy = InvocationGalaxy(listed=many)
    out = _dispatch(galaxy, {"history_id": "h1"})

    rolled = [i for i in out if "outcome" in i]
    assert len(rolled) == invocation_outcome.ROLLUP_LIMIT
    # One extra call each, so an unbounded history cannot cost an unbounded number.
    assert sum(1 for p in galaxy.paths if p.endswith("jobs_summary")) == invocation_outcome.ROLLUP_LIMIT


def test_a_jobs_summary_that_fails_does_not_break_the_call():
    class Failing(InvocationGalaxy):
        async def get(self, path):
            if path.endswith("jobs_summary"):
                raise RuntimeError("HTTP 500")
            return await super().get(path)

    out = _dispatch(Failing(), {"invocation_id": "i1"})
    assert out["outcome"] == "completed"
    assert out["job_states"] == {}
