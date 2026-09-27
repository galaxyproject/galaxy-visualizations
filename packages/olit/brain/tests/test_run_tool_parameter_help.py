"""A rejected parameter comes back with the template the tool accepts.

Split in two: the handler reports the rejection, and the dispatcher attaches the template
because building it is an operation galaxy-ops owns and a handler only gets the Galaxy client.
"""

import asyncio
import json

import pytest

from olit.drivers.loop.galaxy_tools import ToolParameterError, _run_tool
from olit.drivers.loop.tools import ToolSurface

from .fakes import FakeOps, FakeSubstrate

TEMPLATE = {"column": "<value>"}
REJECTION = "HTTP 400: Parameter '0|other_column' has an invalid key structure."


class Galaxy:
    def __init__(self, error):
        self.error = error

    async def get(self, path, **k):
        return {"inputs": [{"name": "column", "type": "text", "value": ""}]}

    async def post(self, path, body):
        raise RuntimeError(self.error)


def test_the_handler_reports_a_parameter_rejection():
    with pytest.raises(ToolParameterError):
        asyncio.run(_run_tool(Galaxy(REJECTION), {"history_id": "h1", "tool_id": "sort1", "inputs": {}}))


def test_an_unrelated_failure_is_left_alone():
    call = {"history_id": "h1", "tool_id": "sort1", "inputs": {}}
    with pytest.raises(RuntimeError) as caught:
        asyncio.run(_run_tool(Galaxy("HTTP 500: upstream exploded"), call))
    assert not isinstance(caught.value, ToolParameterError)


def _dispatch(answer):
    substrate = FakeSubstrate(
        galaxy=Galaxy(REJECTION), ops=FakeOps(answer), capabilities=("llm", "local", "read", "write")
    )
    surface = ToolSurface(substrate)
    return asyncio.run(surface.dispatch("run_tool", {"history_id": "h1", "tool_id": "sort1", "inputs": {}}))


def test_the_dispatcher_attaches_the_template_galaxy_ops_builds():
    outcome = _dispatch(lambda name, args: {"tool_id": args["toolId"], "inputs_template": TEMPLATE})
    assert outcome.is_error
    assert "Fill this template" in outcome.content
    assert json.dumps(TEMPLATE, indent=1) in outcome.content


def test_the_rejection_still_reaches_the_model_without_a_template():
    """The template is help, not the answer: losing it must not lose the rejection."""
    outcome = _dispatch(lambda name, args: {"success": False, "message": "no such tool"})
    assert outcome.is_error
    assert "invalid key structure" in outcome.content
    assert "Fill this template" not in outcome.content


def test_the_template_is_asked_for_by_the_tool_that_was_rejected():
    seen = []

    def answer(name, args):
        seen.append((name, args))
        return {"inputs_template": TEMPLATE}

    _dispatch(answer)
    assert seen == [("get_tool_input_template", {"toolId": "sort1"})]
