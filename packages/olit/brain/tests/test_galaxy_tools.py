"""The loop's Galaxy surface is Orbit's named tools, cloned from galaxy-mcp."""

import asyncio

from olit.drivers.loop.tools import ToolSurface
from olit.substrate.galaxy_ops import GalaxyOps


class FakeManifest:
    def __init__(self, caps):
        self.caps = set(caps)

    def allows(self, capability):
        return capability in self.caps

    def require(self, capability):
        if capability not in self.caps:
            raise PermissionError(f"capability '{capability}' not granted")


class FakeGalaxy:
    def __init__(self, manifest):
        self.manifest = manifest
        self.calls = []

    async def get(self, path):
        self.manifest.require("read")
        self.calls.append(("GET", path))
        return {"path": path}

    async def post(self, path, body=None):
        self.manifest.require("write")
        self.calls.append(("POST", path, body))
        return {"ok": True, "path": path}


class FakeSubstrate:
    def __init__(self, caps=("read",)):
        self.manifest = FakeManifest(caps)
        self.galaxy = FakeGalaxy(self.manifest)
        # Outside Pyodide this reports itself unavailable, so dispatch uses the handler here.
        self.ops = GalaxyOps({}, self.manifest)


def _names(surface):
    return [t["function"]["name"] for t in surface.schemas()]


def test_surface_is_orbit_named_tools_not_catalog_metatools():
    names = _names(ToolSurface(FakeSubstrate(("read",))))
    for expected in ("run_python", "finish", "get_histories", "get_history_contents", "search_tools_by_name"):
        assert expected in names, expected
    assert "galaxy_ops" not in names
    assert "galaxy_call" not in names


def test_write_tools_advertised_only_with_write():
    read_names = _names(ToolSurface(FakeSubstrate(("read",))))
    rw_names = _names(ToolSurface(FakeSubstrate(("read", "write"))))
    assert "run_tool" not in read_names and "create_history" not in read_names
    assert "run_tool" in rw_names and "create_history" in rw_names


def test_run_tool_posts_to_api_tools_and_needs_write():
    # read-only: the dispatcher refuses by declaration, so no request is built at all.
    sub = FakeSubstrate(("read",))
    out = asyncio.run(ToolSurface(sub).dispatch("run_tool", {"history_id": "h", "tool_id": "cat1", "inputs": {}})).text
    assert "not granted" in out
    # with write: posts to the legacy /api/tools route.
    sub2 = FakeSubstrate(("read", "write"))
    asyncio.run(ToolSurface(sub2).dispatch("run_tool", {"history_id": "h", "tool_id": "cat1", "inputs": {}}))
    assert sub2.galaxy.calls[0][0] == "POST"
    assert sub2.galaxy.calls[0][1] == "api/tools"
    assert sub2.galaxy.calls[0][2] == {"history_id": "h", "tool_id": "cat1", "inputs": {}}


def test_a_tool_the_manifest_hides_is_refused_by_name_not_run_headless():
    """Handlers answer to any name, so hiding a tool has to refuse it, not just unlist it.

    A read-only session was still dispatching save_visualization, whose handler reads
    a["visualization"] and raised a bare KeyError the model could only guess at.
    """
    sub = FakeSubstrate(("read",))
    out = asyncio.run(ToolSurface(sub).dispatch("save_visualization", {}))

    assert "save_visualization" not in _names(ToolSurface(sub))
    assert out.refused and "'write' capability" in out.content
    assert sub.galaxy.calls == []


def test_a_granted_tool_still_reports_the_parameters_it_was_not_given():
    sub = FakeSubstrate(("read", "write"))
    out = asyncio.run(ToolSurface(sub).dispatch("save_visualization", {"dataset_id": "d1"}))

    assert "missing required parameter(s): visualization" in out.content
    assert sub.galaxy.calls == []


def test_a_refused_tool_meets_the_loop_guard_like_any_other_failure():
    """The capability refusal is counted, or an unchanged repeat runs to the step cap."""
    sub = FakeSubstrate(("read",))
    surface = ToolSurface(sub)
    args = {"dataset_id": "d1", "visualization": "igv"}
    for _ in range(ToolSurface.FAILED_REPEAT_LIMIT):
        assert "'write' capability" in asyncio.run(surface.dispatch("save_visualization", args)).content
    assert "cannot succeed" in asyncio.run(surface.dispatch("save_visualization", args)).content
