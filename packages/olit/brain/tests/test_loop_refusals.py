"""The loop refuses tool calls it cannot trust, instead of guessing at them."""

import asyncio
import json

from olit.drivers.loop.agent import LoopDriver
from .fakes import FakeSubstrate, ScriptedLlm, call, choice, tool_messages


def _run(llm):
    driver = LoopDriver(FakeSubstrate(llm))
    return driver, asyncio.run(driver.run([{"role": "user", "content": "go"}]))


def test_truncated_message_executes_nothing():
    llm = ScriptedLlm(
        choice([call("run_python", '{"code": "print(1)"}')], finish_reason="length"),
        choice([], content="ok"),
    )
    driver, result = _run(llm)

    assert driver.substrate.local.ran == []
    (tool_message,) = tool_messages(result)
    assert "output token limit" in tool_message["content"]
    assert "run_python" in tool_message["content"]


def test_truncated_message_refuses_every_call_not_just_the_last():
    llm = ScriptedLlm(
        choice(
            [call("run_python", '{"code": "a"}', "c1"), call("run_python", '{"code": "b"}', "c2")],
            finish_reason="length",
        ),
        choice([], content="ok"),
    )
    driver, result = _run(llm)

    assert driver.substrate.local.ran == []
    assert len(tool_messages(result)) == 2


def test_truncated_finish_does_not_end_the_turn():
    """A refused `finish` was never dispatched, so the loop must keep going."""
    llm = ScriptedLlm(
        choice([call("finish", '{"summary": "don')], finish_reason="length"),
        choice([call("finish", '{"summary": "done"}')]),
    )
    _, result = _run(llm)

    assert result["done"] is True
    assert llm.calls, "the loop stopped on the truncated finish"
    assert len(llm.calls) == 2


def test_malformed_arguments_are_reported_not_defaulted():
    llm = ScriptedLlm(
        choice([call("run_python", '{"code": "print(1)"')]),
        choice([], content="ok"),
    )
    driver, result = _run(llm)

    assert driver.substrate.local.ran == [], "ran with substituted empty arguments"
    (tool_message,) = tool_messages(result)
    assert "not valid JSON" in tool_message["content"]
    # pi tells the model what to do next; saying only what broke leaves it to infer.
    assert "Re-issue the tool call" in tool_message["content"]


def test_what_the_model_sent_is_logged_beside_the_refusal():
    """A refusal that does not carry the arguments cannot be diagnosed after the fact."""
    llm = ScriptedLlm(
        choice([call("run_python", "import pandas as pd, json, os")]),
        choice([], content="ok"),
    )
    _, result = _run(llm)

    sent = [line for line in result["logs"] if line.strip().startswith("sent ")]
    assert sent, result["logs"]
    assert "import pandas as pd, json, os" in sent[0]
    assert "broke at 0" in sent[0]


def test_a_break_late_in_a_long_argument_is_still_visible():
    """A head-only excerpt hides the break; most real failures break past the first 300 chars."""
    # An unescaped quote, the shape repair cannot fix, two thousand characters in.
    arguments = '{"code": "' + "x" * 2000 + ' the "preview" text"}'
    llm = ScriptedLlm(
        choice([call("run_python", arguments)]),
        choice([], content="ok"),
    )
    _, result = _run(llm)

    (sent,) = [line for line in result["logs"] if line.strip().startswith("sent ")]
    assert "⟨here⟩" in sent, sent
    assert "xxxx" in sent.split("⟨here⟩")[0], "the text before the break must be shown"
    assert len(sent) < 400, "and it must still be bounded"


def test_finish_alongside_real_work_does_not_end_the_turn():
    """pi's `shouldTerminateToolBatch`: every call in the batch must ask to stop."""
    llm = ScriptedLlm(
        choice([call("finish", '{"summary": "done"}', "c1"), call("run_python", '{"code": "x"}', "c2")]),
        choice([], content="here are the results"),
    )
    driver, result = _run(llm)

    assert driver.substrate.local.ran == ["x"]
    assert len(llm.calls) == 2, "the loop stopped before feeding the tool result back"
    assert result["done"] is False


def test_exhausting_the_step_cap_is_reported():
    """Stopping mid-task without a word is the empty-turn defect again."""
    from olit.drivers.loop import agent as agent_module

    llm = ScriptedLlm(*[choice([call("run_python", '{"code": "x"}')])] * agent_module.MAX_STEPS)
    _, result = _run(llm)

    assert result["exhausted"] is True
    assert result["done"] is False


def test_a_turn_that_ends_normally_is_not_exhausted():
    llm = ScriptedLlm(choice([], content="all done"))
    _, result = _run(llm)

    assert result["exhausted"] is False


def test_a_finished_turn_is_not_exhausted():
    llm = ScriptedLlm(choice([call("finish", '{"summary": "done"}')]))
    _, result = _run(llm)

    assert result["done"] is True
    assert result["exhausted"] is False


def test_well_formed_calls_still_execute():
    llm = ScriptedLlm(
        choice([call("run_python", json.dumps({"code": "print(1)"}))]),
        choice([], content="ok"),
    )
    driver, result = _run(llm)

    assert driver.substrate.local.ran == ["print(1)"]
    (tool_message,) = tool_messages(result)
    assert tool_message["content"] == "ran"


def unparsable(n):
    """n calls whose arguments differ byte for byte but never parse."""
    return [choice([call("run_python", "import os" + "x" * i)]) for i in range(n)]


def test_arguments_that_keep_failing_to_parse_stop_being_asked_for():
    """The guard lives in dispatch, which a malformed call never reaches."""
    llm = ScriptedLlm(*unparsable(5), choice([], content="ok"))
    _, result = _run(llm)

    refusals = [m["content"] for m in tool_messages(result)]
    assert any("failed to parse" in r for r in refusals), refusals
    assert any("shape is the problem" in r for r in refusals)


def test_a_parsable_call_in_between_clears_the_count():
    """Three failures either side of a working call are not one run of failures."""
    llm = ScriptedLlm(
        *unparsable(2),
        choice([call("run_python", '{"code": "1"}')]),
        *unparsable(2),
        choice([], content="ok"),
    )
    _, result = _run(llm)

    assert not [m for m in tool_messages(result) if "failed to parse" in m["content"]]
