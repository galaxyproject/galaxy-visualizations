"""The bridge carries a name and arguments across and brings an envelope back.

What is tested is only that: the crossing. What each operation does is galaxy-ops's, and is
tested there. The one thing the bridge must get right on its own is the spelling, because the
two contracts disagree about it in a way that would quietly corrupt a payload.
"""

import asyncio
import json
import pathlib

from olit.drivers.loop import galaxy_tools
from olit.drivers.loop.outcome import rendered
from olit.drivers.loop.tools import ToolSurface
from olit.substrate import galaxy_ops
from olit.substrate.galaxy_ops import GalaxyOps, as_wire, camel


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
        return self.envelope


def test_a_declared_argument_is_renamed_for_the_wire():
    assert camel("tool_id") == "toolId"
    assert as_wire({"tool_id": "cat1", "tool_version": "1.0"}) == {"toolId": "cat1", "toolVersion": "1.0"}


def test_a_single_word_argument_is_left_alone():
    assert as_wire({"limit": 2, "offset": 0, "name": "x"}) == {"limit": 2, "offset": 0, "name": "x"}


def test_the_values_are_never_renamed():
    """Galaxy's own keys live in there: shell_command, from_work_dir, queries_0|input2."""
    payload = {"shell_command": "echo", "from_work_dir": "out.txt", "queries_0|input2": {"src": "hda"}}
    assert as_wire({"tool_id": "t", "inputs": payload})["inputs"] == payload


def test_a_tool_is_delegated_exactly_when_it_has_no_handler_here():
    """The two facts are one fact, so they cannot drift apart."""
    for tool in galaxy_tools.TOOLS:
        delegated = galaxy_tools.delegated_to_ops(tool["name"])
        if tool["handler"] is None:
            assert delegated == tool["capability"], tool["name"]
        else:
            assert delegated is None, tool["name"]


def test_every_galaxy_operation_is_either_delegated_or_says_why_it_is_not():
    """A shared operation kept here needs a reason on the record, not a silent handler."""
    shared = set(json.loads((pathlib.Path(__file__).parent / "data" / "galaxy-ops-browser.json").read_text()))
    kept = {t["name"] for t in galaxy_tools.TOOLS if t["handler"] is not None} & shared
    assert kept == set(galaxy_tools.KEPT_LOCAL), (
        f"kept without a reason: {sorted(kept - set(galaxy_tools.KEPT_LOCAL))}; "
        f"reason with no tool: {sorted(set(galaxy_tools.KEPT_LOCAL) - kept)}"
    )
    delegated = {t["name"] for t in galaxy_tools.TOOLS if t["handler"] is None}
    assert delegated <= shared, f"delegated but absent from galaxy-ops: {sorted(delegated - shared)}"
    assert delegated | kept == shared, f"galaxy-ops operations olit does not serve: {sorted(shared - delegated - kept)}"


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


class _NoTransport(GalaxyOps):
    """A runtime with nothing to carry the call: the browser shell absent and no node."""

    def __init__(self):
        self.manifest = Manifest()
        self._transports = []


def test_a_runtime_with_no_transport_answers_with_a_failure_not_an_exception():
    envelope = asyncio.run(_NoTransport().run("get_histories", {}))
    assert envelope["success"] is False
    assert envelope["errorKind"] == "unavailable"
    assert "transport" in envelope["message"]


def test_a_transport_that_dies_mid_call_is_reported_the_same_way():
    class Dies(GalaxyOps):
        def __init__(self):
            self.manifest = Manifest()
            self._transports = [self]

        def available(self):
            return True

        async def run(self, name, wire):
            raise galaxy_ops.GalaxyOpsUnavailable("driver stopped: boom")

    ops = Dies()
    envelope = asyncio.run(GalaxyOps.run(ops, "get_histories", {}))
    assert envelope["success"] is False
    assert "driver stopped" in envelope["message"]


def test_the_facade_never_returns_a_tuple():
    """One channel: every answer is an envelope, so no caller unpacks a refusal."""
    envelope = asyncio.run(_NoTransport().run("get_histories", {}))
    assert isinstance(envelope, dict)


def test_a_scoped_view_carries_everything_the_facade_holds():
    """Copied rather than rebuilt field by field, so a new field cannot be left behind."""
    ops = GalaxyOps({"galaxy_root": "http://galaxy.invalid/", "galaxy_key": "k"}, Manifest())
    view = ops.scoped(Manifest())
    assert vars(view).keys() == vars(ops).keys()
    assert view._transports is ops._transports, "a scoped view must share the transports"
