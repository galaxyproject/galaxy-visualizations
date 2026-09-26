"""A Galaxy tool that fails says so in prose.

Success carries its payload under `data`; failure is a sentence the model can act on. Both
halves used to be mixed: the guards and all 35 delegated tools answered in prose while 16
local handlers answered with a dict, so one class of event had two shapes. Prose was already
the majority and is what a refusal has to be -- an instruction, not a record.
"""

import ast
import asyncio
import json
import pathlib

from olit.drivers.loop import galaxy_tools
from olit.drivers.loop.tools import ToolSurface

from .fakes import FakeOps, FakeSubstrate


def test_no_galaxy_handler_states_a_failure_as_a_dict():
    """The shape this replaced; a structured failure is a second contract."""
    source = pathlib.Path(galaxy_tools.__file__).read_text()
    offenders = []
    for node in ast.walk(ast.parse(source)):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "ToolOutcome"):
            continue
        if node.args and isinstance(node.args[0], ast.Dict):
            offenders.append(node.lineno)
    assert not offenders, f"these state a failure as a dict: lines {offenders}"


class _Galaxy:
    async def get(self, path, binary=False):
        return {"content": "x", "content_editor": "x"}

    async def put(self, path, body=None):
        return {"id": "p1"}

    async def post(self, path, body=None):
        return {"id": "p1"}


def _dispatch(name, args, answer=None):
    substrate = FakeSubstrate(galaxy=_Galaxy(), ops=FakeOps(answer), capabilities=("llm", "local", "read", "write"))
    return asyncio.run(ToolSurface(substrate).dispatch(name, args))


def test_a_local_refusal_reads_as_a_sentence():
    out = _dispatch("update_page", {"page_id": "p1", "content": "visualization_id=ngl"})
    assert out.is_error and isinstance(out.content, str)
    assert not out.content.lstrip().startswith("{"), "a failure is prose, not a record"


def test_a_delegated_failure_reads_the_same_way():
    out = _dispatch("get_histories", {}, answer=lambda n, a: {"success": False, "message": "Not found (404)"})
    assert out.is_error and out.content == "Not found (404)"


def test_a_refusal_still_carries_what_the_model_needs_to_recover():
    """Dropping the dict must not drop the instruction that was inside it."""
    out = _dispatch("update_page", {"page_id": "p1", "content": "visualization_id=ngl"})
    assert "{{artifact}}" in out.content, "the way out has to survive the reshaping"


def test_success_is_still_a_record_under_data():
    out = _dispatch("get_histories", {}, answer=lambda n, a: [{"id": "h1"}])
    assert json.loads(out.text)["data"] == [{"id": "h1"}]
