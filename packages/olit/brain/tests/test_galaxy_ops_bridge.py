"""The bridge carries a name and arguments across and brings an envelope back.

What is tested is only that: the crossing. What each operation does is galaxy-ops's, and is
tested there. The one thing the bridge must get right on its own is the spelling, because the
two contracts disagree about it in a way that would quietly corrupt a payload.
"""

import asyncio
import json

from olit.drivers.loop import galaxy_tools
from olit.drivers.loop.tools import ToolSurface
from olit.substrate.galaxy_ops import GalaxyOps, as_wire, camel, rendered


class Manifest:
    def __init__(self, caps=("read", "write")):
        self.caps = set(caps)

    def require(self, cap):
        if cap not in self.caps:
            raise PermissionError(cap)

    def allows(self, cap):
        return cap in self.caps

    def intersect(self, caps):
        return Manifest(self.caps & set(caps))


class Executor(GalaxyOps):
    """A GalaxyOps whose crossing is a python call, so the wiring is testable off the browser."""

    def __init__(self, envelope, manifest=None):
        self.manifest = manifest or Manifest()
        self.envelope = envelope
        self.seen = []

    def available(self):
        return True

    async def run(self, name, args, capability="read"):
        self.manifest.require(capability)
        self.seen.append((name, as_wire(args)))
        if not self.envelope.get("success"):
            return None, self.envelope.get("message")
        return self.envelope, None


def test_a_declared_argument_is_renamed_for_the_wire():
    assert camel("tool_id") == "toolId"
    assert as_wire({"tool_id": "cat1", "tool_version": "1.0"}) == {"toolId": "cat1", "toolVersion": "1.0"}


def test_a_single_word_argument_is_left_alone():
    assert as_wire({"limit": 2, "offset": 0, "name": "x"}) == {"limit": 2, "offset": 0, "name": "x"}


def test_the_values_are_never_renamed():
    """Galaxy's own keys live in there: shell_command, from_work_dir, queries_0|input2."""
    payload = {"shell_command": "echo", "from_work_dir": "out.txt", "queries_0|input2": {"src": "hda"}}
    assert as_wire({"tool_id": "t", "inputs": payload})["inputs"] == payload


def test_only_the_three_proven_operations_are_delegated():
    assert set(galaxy_tools.DELEGATED_TO_OPS) == {
        "get_tool_run_examples",
        "get_histories",
        "get_tool_input_template",
    }
    for name in galaxy_tools.DELEGATED_TO_OPS:
        assert galaxy_tools.get_handler(name), f"{name} must keep its handler for rollback"


def test_a_delegated_call_goes_through_the_executor():
    surface = ToolSurface(_substrate(Executor({"success": True, "data": [{"id": "h1"}], "message": "1 history"})))
    out = asyncio.run(surface.dispatch("get_histories", {"limit": 2}))
    assert json.loads(out.content if hasattr(out, "content") else out)["data"] == [{"id": "h1"}]
    assert surface.substrate.ops.seen == [("get_histories", {"limit": 2})]


def test_an_undelegated_call_never_reaches_the_executor():
    sub = _substrate(Executor({"success": True, "data": []}))
    asyncio.run(ToolSurface(sub).dispatch("get_history_contents", {"history_id": "h1"}))
    assert sub.ops.seen == []


def test_a_failed_operation_comes_back_as_a_tool_error():
    surface = ToolSurface(_substrate(Executor({"success": False, "message": "nope", "errorKind": "auth"})))
    out = asyncio.run(surface.dispatch("get_histories", {}))
    assert out.is_error and "nope" in out.content


def test_the_envelope_reaches_the_model_without_its_empty_halves():
    assert json.loads(rendered({"data": 1, "success": True, "message": None})) == {"data": 1}


def test_an_unavailable_executor_leaves_the_handler_in_charge():
    """Outside the browser there is no executor, and every operation runs as it always did."""
    assert GalaxyOps({}, Manifest()).available() is False


def _substrate(ops):
    class Galaxy:
        def __init__(self):
            self.calls = []

        def scoped(self, _m):
            return self

        async def get(self, path):
            self.calls.append(path)
            return {}

    class Substrate:
        def __init__(self):
            self.manifest = Manifest()
            self.galaxy = Galaxy()
            self.ops = ops

    return Substrate()
