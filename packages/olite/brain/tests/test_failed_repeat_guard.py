"""A call that keeps failing with identical arguments is refused, not retried forever."""
import asyncio

from olite.drivers.loop.tools import ToolSurface

from .fakes import FakeSubstrate


class Runner(ToolSurface):
    def __init__(self, fails=True):
        # `_dispatch` is overridden, so the substrate is here only for the capability gate.
        super().__init__(substrate=FakeSubstrate(capabilities=("llm", "local", "read", "write")))
        self.calls, self.fails = 0, fails

    def _missing_required(self, schema, args):
        return []

    async def _dispatch(self, name, args):
        from olite.drivers.loop.tools import ToolOutcome
        self.calls += 1
        return ToolOutcome("boom" if self.fails else "fine", is_error=self.fails)


def call(r, args):
    return asyncio.run(r.dispatch("run_tool", args))


def test_identical_failures_are_refused_after_the_limit():
    r = Runner()
    for _ in range(ToolSurface.FAILED_REPEAT_LIMIT):
        assert not call(r, {"a": 1}).refused
    out = call(r, {"a": 1})
    assert out.refused and "cannot succeed" in out.content
    assert r.calls == ToolSurface.FAILED_REPEAT_LIMIT


def test_changed_arguments_are_allowed_through():
    r = Runner()
    for i in range(ToolSurface.FAILED_REPEAT_LIMIT + 2):
        assert not call(r, {"a": i}).refused


def test_the_refusal_breaks_the_loop_without_banning_the_call():
    """Conditions can change, so the guard interrupts rather than forbids."""
    r = Runner()
    for _ in range(ToolSurface.FAILED_REPEAT_LIMIT):
        call(r, {"a": 1})
    assert call(r, {"a": 1}).refused
    r.fails = False
    out = call(r, {"a": 1})
    assert not out.refused and out.content == "fine"


class Raiser(Runner):
    """Galaxy rejections arrive as exceptions, which is the path that matters most."""

    async def _dispatch(self, name, args):
        self.calls += 1
        raise RuntimeError("HTTP 400: invalid key structure")


def test_a_call_that_keeps_raising_is_also_cut_off():
    r = Raiser()
    for _ in range(ToolSurface.FAILED_REPEAT_LIMIT):
        assert not call(r, {"a": 1}).refused
    assert call(r, {"a": 1}).refused
    assert r.calls == ToolSurface.FAILED_REPEAT_LIMIT
