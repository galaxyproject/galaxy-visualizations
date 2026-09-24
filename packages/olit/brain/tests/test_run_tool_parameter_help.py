"""A rejected parameter comes back with the template the tool accepts."""

import asyncio
import pytest
from olit.drivers.loop.galaxy_tools import ToolParameterError, _run_tool

TOOL = {"inputs": [{"name": "column", "type": "text", "value": ""}]}


class Galaxy:
    def __init__(self, error):
        self.error = error

    async def get(self, path, **k):
        return TOOL

    async def post(self, path, body):
        raise RuntimeError(self.error)


def run(g):
    return asyncio.run(_run_tool(g, {"history_id": "h1", "tool_id": "sort1", "inputs": {}}))


def test_a_key_structure_rejection_carries_the_template():
    with pytest.raises(ToolParameterError) as caught:
        run(Galaxy("HTTP 400: Parameter '0|other_column' has an invalid key structure."))
    assert "column" in str(caught.value)
    assert "Fill this template" in str(caught.value)


def test_an_unrelated_failure_is_left_alone():
    with pytest.raises(RuntimeError) as caught:
        run(Galaxy("HTTP 500: upstream exploded"))
    assert not isinstance(caught.value, ToolParameterError)
