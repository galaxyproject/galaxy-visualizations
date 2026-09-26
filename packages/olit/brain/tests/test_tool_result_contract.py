"""One result contract for every Galaxy tool, whichever side ran it.

The descriptions are galaxy-mcp's and promise a GalaxyResult whose payload sits under `data`.
Delegated tools always answered that way; a local handler used to answer with the bare payload,
so the same promise was true for 35 tools and false for 16.

A handler that builds its own ToolOutcome is the other half: it used to be serialised with
`json.dumps(..., default=str)`, which handed the model the Python repr and dropped is_error, so
the repeated-failure guard never counted the refusal and the model retried it.
"""

import asyncio
import json

from olit.drivers.loop.outcome import rendered
from olit.drivers.loop.tools import ToolSurface

from .fakes import FakeOps, FakeSubstrate


class _Galaxy:
    async def get(self, path, binary=False):
        return [{"id": "d1", "hid": 1}]

    async def put(self, path, body=None):
        return {"id": "p1"}

    async def post(self, path, body=None):
        return {"id": "p1"}


def _surface(answer=None):
    substrate = FakeSubstrate(galaxy=_Galaxy(), ops=FakeOps(answer), capabilities=("llm", "local", "read", "write"))
    return ToolSurface(substrate)


def _dispatch(name, args, answer=None):
    return asyncio.run(_surface(answer).dispatch(name, args))


def test_a_local_tool_puts_its_payload_under_data():
    out = _dispatch("get_history_contents", {"history_id": "h1"})
    assert json.loads(out.text)["data"]["items"] == [{"id": "d1", "hid": 1}]


def test_a_delegated_tool_puts_its_payload_under_data():
    out = _dispatch("get_histories", {"limit": 1}, answer=lambda n, a: [{"id": "h1"}])
    assert json.loads(out.text)["data"] == [{"id": "h1"}]


def test_both_sides_answer_in_the_same_shape():
    local = set(json.loads(_dispatch("get_history_contents", {"history_id": "h1"}).text))
    delegated = set(json.loads(_dispatch("get_histories", {}, answer=lambda n, a: []).text))
    assert local <= {"data", "message", "pagination"}
    assert delegated <= {"data", "message", "pagination"}
    assert "data" in local and "data" in delegated


def test_a_handler_refusal_keeps_its_error_flag_and_guard():
    out = _dispatch("update_page", {"page_id": "p1", "content": "visualization_id=ngl"})
    assert out.is_error and out.refused
    assert out.guard == "malformed-object-id"


def test_a_handler_refusal_is_not_serialised_as_a_python_repr():
    """The repr also lost is_error, so the loop guard never counted the refusal."""
    out = _dispatch("update_page", {"page_id": "p1", "content": "visualization_id=ngl"})
    assert "ToolOutcome(" not in str(out.content)
    assert "is_error=" not in str(out.content)


def test_the_envelope_leaves_out_what_is_empty():
    assert json.loads(rendered({"data": 1, "message": None, "pagination": None})) == {"data": 1}
    assert json.loads(rendered({"data": 1, "message": "m"})) == {"data": 1, "message": "m"}
