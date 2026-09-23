"""Stop ends the turn, at pi's check points."""

import asyncio

from olit.drivers.loop.agent import LoopDriver
from olit.substrate import Cancellation
from .fakes import FakeSubstrate, ScriptedLlm, call, choice, tool_messages


class Trigger:
    """A cancellation the test can trip, and that reports how often it was read."""

    def __init__(self, abort_after=None):
        self.reads = 0
        self.aborted_flag = False
        self.abort_after = abort_after
        self.cancellation = Cancellation(poll=self._poll)

    def _poll(self):
        self.reads += 1
        if self.abort_after is not None and self.reads > self.abort_after:
            self.aborted_flag = True
        return self.aborted_flag


def _run(llm, cancellation=None):
    driver = LoopDriver(FakeSubstrate(llm))
    return driver, asyncio.run(driver.run([{"role": "user", "content": "go"}], None, cancellation))


def test_an_already_aborted_run_never_calls_the_model():
    trigger = Trigger()
    trigger.aborted_flag = True
    llm = ScriptedLlm()

    _, result = _run(llm, trigger.cancellation)

    assert llm.calls == []
    assert result["aborted"] is True


def test_aborting_mid_turn_stops_before_the_next_completion():
    """The turn ends at the next check point rather than running to the step cap."""
    llm = ScriptedLlm(*[choice([call("run_python", '{"code": "x"}')])] * 5)
    trigger = Trigger()
    llm.on_call = lambda: setattr(trigger, "aborted_flag", True)

    _, result = _run(llm, trigger.cancellation)

    assert len(llm.calls) == 1
    assert result["aborted"] is True


def test_every_remaining_call_in_the_batch_still_gets_a_result():
    """A tool_call with no result would make the next request malformed."""
    llm = ScriptedLlm(
        choice([call("run_python", '{"code": "a"}', "c1"), call("run_python", '{"code": "b"}', "c2")]),
    )
    trigger = Trigger()
    llm.on_call = lambda: setattr(trigger, "aborted_flag", True)

    driver, result = _run(llm, trigger.cancellation)

    assert driver.substrate.local.ran == [], "a tool ran after the stop"
    answered = tool_messages(result)
    assert len(answered) == 2
    assert all(m["content"] == "Operation aborted" for m in answered)
    assert {m["tool_call_id"] for m in answered} == {"c1", "c2"}


def test_a_provider_error_is_reported_as_an_error_unless_the_run_was_aborted():
    """The flag decides, not the exception — a real failure must not read as a stop."""

    class Failing:
        async def complete(self, messages, tools=None, **kwargs):
            raise RuntimeError("The user aborted a request.")

    driver = LoopDriver(FakeSubstrate(Failing()))
    try:
        asyncio.run(driver.run([{"role": "user", "content": "go"}], None, Cancellation()))
    except RuntimeError:
        pass
    else:  # pragma: no cover
        raise AssertionError("a provider failure was swallowed as a stop")


def test_a_cancelled_request_raising_is_reported_as_a_stop():
    class Cancelled:
        def __init__(self, trigger):
            self.trigger = trigger

        async def complete(self, messages, tools=None, **kwargs):
            self.trigger.aborted_flag = True
            raise RuntimeError("signal is aborted without reason")

    trigger = Trigger()
    driver = LoopDriver(FakeSubstrate(Cancelled(trigger)))
    result = asyncio.run(driver.run([{"role": "user", "content": "go"}], None, trigger.cancellation))

    assert result["aborted"] is True
    assert result["exhausted"] is False


def test_a_normal_turn_is_not_aborted():
    llm = ScriptedLlm(choice([], content="done"))
    _, result = _run(llm, Trigger().cancellation)

    assert result["aborted"] is False


def test_the_default_cancellation_never_aborts():
    """The eval harness and the tests pass none; a turn must still run."""
    assert Cancellation().aborted is False
    assert Cancellation().signal is None


def test_a_broken_bridge_reports_not_aborted_rather_than_crashing_the_turn():
    """Raising here would surface to the user as a bug rather than as a stop."""

    def gone():
        raise RuntimeError("worker torn down")

    assert Cancellation(poll=gone).aborted is False
