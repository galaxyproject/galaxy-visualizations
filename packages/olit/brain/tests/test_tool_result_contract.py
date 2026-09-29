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

from olit.loop.outcome import rendered
from olit.loop.tools import ToolSurface

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
    out = _dispatch("update_page", {"page_id": "p1", "content": "history_dataset_id=reads"})
    assert out.is_error and out.refused
    assert out.guard == "malformed-object-id"


def test_a_handler_refusal_is_not_serialised_as_a_python_repr():
    """The repr also lost is_error, so the loop guard never counted the refusal."""
    out = _dispatch("update_page", {"page_id": "p1", "content": "history_dataset_id=reads"})
    assert "ToolOutcome(" not in str(out.content)
    assert "is_error=" not in str(out.content)


def test_the_envelope_leaves_out_what_is_empty():
    assert json.loads(rendered({"data": 1, "message": None, "pagination": None})) == {"data": 1}
    assert json.loads(rendered({"data": 1, "message": "m"})) == {"data": 1, "message": "m"}


def test_the_samples_the_shell_reads_are_produced_by_this_surface():
    """`tool_result_samples` is the one producer for both sides of the boundary.

    The shell's `tool-result.boundary.test.ts` runs it and reads the output with the real
    readers. Exercising it here too means a broken producer fails on this side rather than
    only in the other suite.
    """
    from .tool_result_samples import CALLS, produce

    samples = produce()
    assert set(samples) == {label for label, _, _ in CALLS}
    for label, content in samples.items():
        payload = json.loads(content.split("\n\n", 1)[0])
        assert isinstance(payload, dict), f"{label} does not open with an object"
        # notebook_resume is Olit's own tool and answers with its object; the rest are Galaxy's.
        if label != "notebook_resume":
            assert "data" in payload, f"{label} carries no data"


def test_the_options_tool_refusal_crosses_the_boundary_as_a_refusal():
    """It was dispatched by a special case that re-serialised its outcome, so a live session
    read `ToolOutcome(...)` as prose and chose another branch instead of passing config."""

    class Plugins(_Galaxy):
        async def get(self, path, binary=False):
            if path == "api/plugins/igv":
                return {
                    "name": "igv",
                    "settings": [
                        {
                            "name": "source",
                            "type": "conditional",
                            "test_param": {
                                "name": "origin",
                                "data": [{"label": "IGV Remote Genome", "value": "igv"}],
                            },
                            "cases": [{"value": "igv", "inputs": [{"name": "genome", "type": "data_json"}]}],
                        }
                    ],
                }
            return await super().get(path, binary=binary)

    substrate = FakeSubstrate(galaxy=Plugins(), capabilities=("llm", "local", "read"))
    out = asyncio.run(
        ToolSurface(substrate).dispatch(
            "get_visualization_options", {"visualization": "igv", "parameter": "settings.source.genome"}
        )
    )

    assert out.is_error
    assert "ToolOutcome(" not in str(out.content)
    assert "Refused" in str(out.content)
