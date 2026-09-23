"""An invocation is judged by its jobs, not by whether Galaxy could schedule it."""

import asyncio
import json

from olite.drivers.loop import invocation_outcome
from olite.drivers.loop.tools import ToolSurface
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


def test_a_cancelled_run_is_reported_as_cancelled():
    assert invocation_outcome.settle("cancelled", {}) == "cancelled"


def test_a_failed_outcome_says_what_to_do_next():
    out = invocation_outcome.described(SCHEDULED, {"error": 1})

    assert out["outcome"] == "failed"
    assert out["job_states"] == {"error": 1}
    assert "get_job_details" in out["outcome_note"]
    # Galaxy's own answer is kept: it is the truth about scheduling.
    assert out["state"] == "completed"


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
    return json.loads(asyncio.run(ToolSurface(substrate).dispatch("get_invocations", args)).text)


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
