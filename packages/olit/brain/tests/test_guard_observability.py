"""Olit's own caps and guards are named in the result, so an eval can see one in a trajectory."""

import asyncio

from olit.drivers.loop.agent import LoopDriver

from .fakes import FakeSubstrate, ScriptedLlm, call, choice


def run(llm, **config):
    driver = LoopDriver(FakeSubstrate(llm, config=config))
    return asyncio.run(driver.run([{"role": "user", "content": "go"}]))


def test_a_turn_no_guard_touched_reports_none():
    result = run(ScriptedLlm(choice([], content="ok")))
    assert result["guards"] == []


def test_a_capability_the_session_lacks_is_named():
    llm = ScriptedLlm(
        choice([call("create_history", '{"name": "x"}')]),
        choice([], content="ok"),
    )
    result = run(llm)
    assert {"guard": "capability", "tool": "create_history"} in result["guards"]


def test_a_spent_step_budget_is_named():
    llm = ScriptedLlm(*[choice([call("run_python", '{"code": "1"}')]) for _ in range(4)])
    result = run(llm, max_steps=2)
    assert result["exhausted"] is True
    assert {"guard": "max-steps", "steps": 2} in result["guards"]
