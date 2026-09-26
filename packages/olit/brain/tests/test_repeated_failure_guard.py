"""A call that keeps failing is recognised however the run is interleaved.

From a live viz-structure-saved run: update_page refused on `malformed-object-id` four times,
each attempt separated by a successful get_page. The counter kept only the most recent failure
and any success cleared it, so four refusals never reached the limit of three.
"""

import asyncio

from olit.drivers.loop.tools import ToolSurface

from .fakes import FakeOps, FakeSubstrate


class _Galaxy:
    """A page whose content is always refused, and reads that always work."""

    async def get(self, path, binary=False):
        return {"content": "x", "content_editor": "x"}

    async def put(self, path, body=None):
        return {"id": "p1"}

    async def post(self, path, body=None):
        return {"id": "p1"}


def _surface():
    return ToolSurface(FakeSubstrate(galaxy=_Galaxy(), ops=FakeOps(), capabilities=("llm", "local", "read", "write")))


REFUSED = {"page_id": "p1", "content": "visualization_id=ngl"}


def _dispatch(surface, name, args):
    return asyncio.run(surface.dispatch(name, args))


def test_the_same_failing_call_is_refused_on_the_fourth_try():
    surface = _surface()
    for _ in range(3):
        assert _dispatch(surface, "update_page", REFUSED).guard == "malformed-object-id"
    assert _dispatch(surface, "update_page", REFUSED).guard == "repeated-failure"


def test_a_success_in_between_does_not_forgive_the_failures():
    """The exact shape observed live: fail, read, fail, read, fail, read, fail."""
    surface = _surface()
    for _ in range(3):
        assert _dispatch(surface, "update_page", REFUSED).is_error
        assert not _dispatch(surface, "get_page", {"page_id": "p1"}).is_error
    assert _dispatch(surface, "update_page", REFUSED).guard == "repeated-failure"


def test_refusing_is_a_speed_bump_rather_than_a_ban():
    """The count is dropped once refused, so the model gets another go at the same call."""
    surface = _surface()
    for _ in range(4):
        _dispatch(surface, "update_page", REFUSED)
    after = _dispatch(surface, "update_page", REFUSED)
    assert after.guard == "malformed-object-id", "the ban outlived its refusal"


def test_a_different_call_keeps_its_own_count():
    surface = _surface()
    for _ in range(3):
        _dispatch(surface, "update_page", REFUSED)
    other = dict(REFUSED, content="visualization_id=molstar")
    assert _dispatch(surface, "update_page", other).guard == "malformed-object-id"


def test_a_failure_on_one_tool_does_not_count_against_another():
    surface = _surface()
    for _ in range(3):
        _dispatch(surface, "update_page", REFUSED)
    assert not _dispatch(surface, "get_page", {"page_id": "p1"}).is_error
