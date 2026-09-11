"""The loop refuses tool calls it cannot trust, instead of guessing at them."""

import asyncio
import json

from olite.drivers.loop.agent import LoopDriver
from olite.substrate import CapabilityManifest
from olite.substrate.llm import Reply


class ScriptedLlm:
    """Replays prepared `choices` entries, one per loop step."""

    def __init__(self, *choices):
        self.choices = list(choices)
        self.calls = []

    async def complete(self, messages, tools=None, **kwargs):
        self.calls.append(messages)
        return self.choices.pop(0)


class Local:
    def __init__(self):
        self.ran = []

    def run(self, code):
        self.ran.append(code)
        return "ran"


class FakeSubstrate:
    def __init__(self, llm):
        self.llm = llm
        self.local = Local()
        self.galaxy = None
        self.manifest = CapabilityManifest(["llm", "local", "read"])


def _call(name, arguments, call_id="c1"):
    return {"id": call_id, "function": {"name": name, "arguments": arguments}}


def _choice(tool_calls, finish_reason="tool_calls", content=""):
    return Reply(content=content, tool_calls=tool_calls, finish_reason=finish_reason)


def _tool_messages(result):
    return [m for m in result["messages"] if m.get("role") == "tool"]


def _run(llm):
    driver = LoopDriver(FakeSubstrate(llm))
    return driver, asyncio.run(driver.run([{"role": "user", "content": "go"}]))


def test_truncated_message_executes_nothing():
    llm = ScriptedLlm(
        _choice([_call("run_python", '{"code": "print(1)"}')], finish_reason="length"),
        _choice([], content="ok"),
    )
    driver, result = _run(llm)

    assert driver.substrate.local.ran == []
    (tool_message,) = _tool_messages(result)
    assert "output token limit" in tool_message["content"]
    assert "run_python" in tool_message["content"]


def test_truncated_message_refuses_every_call_not_just_the_last():
    llm = ScriptedLlm(
        _choice(
            [_call("run_python", '{"code": "a"}', "c1"), _call("run_python", '{"code": "b"}', "c2")],
            finish_reason="length",
        ),
        _choice([], content="ok"),
    )
    driver, result = _run(llm)

    assert driver.substrate.local.ran == []
    assert len(_tool_messages(result)) == 2


def test_truncated_finish_does_not_end_the_turn():
    """A refused `finish` was never dispatched, so the loop must keep going."""
    llm = ScriptedLlm(
        _choice([_call("finish", '{"summary": "don')], finish_reason="length"),
        _choice([_call("finish", '{"summary": "done"}')]),
    )
    _, result = _run(llm)

    assert result["done"] is True
    assert llm.calls, "the loop stopped on the truncated finish"
    assert len(llm.calls) == 2


def test_malformed_arguments_are_reported_not_defaulted():
    llm = ScriptedLlm(
        _choice([_call("run_python", '{"code": "print(1)"')]),
        _choice([], content="ok"),
    )
    driver, result = _run(llm)

    assert driver.substrate.local.ran == [], "ran with substituted empty arguments"
    (tool_message,) = _tool_messages(result)
    assert "not valid JSON" in tool_message["content"]
    # pi tells the model what to do next; saying only what broke leaves it to infer.
    assert "Re-issue the tool call" in tool_message["content"]


def test_finish_alongside_real_work_does_not_end_the_turn():
    """pi's `shouldTerminateToolBatch`: every call in the batch must ask to stop."""
    llm = ScriptedLlm(
        _choice([_call("finish", '{"summary": "done"}', "c1"), _call("run_python", '{"code": "x"}', "c2")]),
        _choice([], content="here are the results"),
    )
    driver, result = _run(llm)

    assert driver.substrate.local.ran == ["x"]
    assert len(llm.calls) == 2, "the loop stopped before feeding the tool result back"
    assert result["done"] is False


def test_exhausting_the_step_cap_is_reported():
    """Stopping mid-task without a word is the empty-turn defect again."""
    from olite.drivers.loop import agent as agent_module

    llm = ScriptedLlm(*[_choice([_call("run_python", '{"code": "x"}')])] * agent_module.MAX_STEPS)
    _, result = _run(llm)

    assert result["exhausted"] is True
    assert result["done"] is False


def test_a_turn_that_ends_normally_is_not_exhausted():
    llm = ScriptedLlm(_choice([], content="all done"))
    _, result = _run(llm)

    assert result["exhausted"] is False


def test_a_finished_turn_is_not_exhausted():
    llm = ScriptedLlm(_choice([_call("finish", '{"summary": "done"}')]))
    _, result = _run(llm)

    assert result["done"] is True
    assert result["exhausted"] is False


def test_well_formed_calls_still_execute():
    llm = ScriptedLlm(
        _choice([_call("run_python", json.dumps({"code": "print(1)"}))]),
        _choice([], content="ok"),
    )
    driver, result = _run(llm)

    assert driver.substrate.local.ran == ["print(1)"]
    (tool_message,) = _tool_messages(result)
    assert tool_message["content"] == "ran"
