"""The loop's Galaxy surface is Orbit's named tools, cloned from galaxy-mcp."""

import asyncio
import json

from olite.drivers.loop.tools import ToolSurface


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


def test_get_histories_hits_the_right_endpoint():
    sub = FakeSubstrate(("read",))
    asyncio.run(ToolSurface(sub).dispatch("get_histories", {"limit": 5}))
    assert sub.galaxy.calls[0][0] == "GET"
    assert sub.galaxy.calls[0][1].startswith("api/histories")
    assert "limit=5" in sub.galaxy.calls[0][1]


def test_run_tool_posts_to_api_tools_and_needs_write():
    # read-only: run_tool routes to GalaxyHttp.post -> require('write') -> raises -> caught.
    sub = FakeSubstrate(("read",))
    out = asyncio.run(ToolSurface(sub).dispatch("run_tool", {"history_id": "h", "tool_id": "cat1", "inputs": {}})).text
    assert "not granted" in out
    # with write: posts to the legacy /api/tools route.
    sub2 = FakeSubstrate(("read", "write"))
    asyncio.run(ToolSurface(sub2).dispatch("run_tool", {"history_id": "h", "tool_id": "cat1", "inputs": {}}))
    assert sub2.galaxy.calls[0][0] == "POST"
    assert sub2.galaxy.calls[0][1] == "api/tools"
    assert sub2.galaxy.calls[0][2] == {"history_id": "h", "tool_id": "cat1", "inputs": {}}


def test_tool_panel_counts_tools_not_panel_entries():
    # The panel's top level is mostly sections; counting it answers ~20 for a server
    # with hundreds of tools. The count has to come from the tool, not the reader.
    panel = [
        {"model_class": "ToolSection", "name": "Get Data", "elems": [
            {"model_class": "DataSourceTool", "id": "upload1"},
            {"model_class": "Tool", "id": "ftp"},
            {"model_class": "ToolSectionLabel", "text": "not a tool"},
        ]},
        {"model_class": "ToolSection", "name": "Collection Operations", "elems": [
            {"model_class": "UnzipCollectionTool", "id": "unzip"},
            {"model_class": "FilterFailedDatasetsTool", "id": "filter_failed"},
        ]},
        {"model_class": "Tool", "id": "loose_tool"},
        {"model_class": "ToolSectionLabel", "text": "also not a tool"},
    ]
    from olite.drivers.loop.galaxy_tools import _count_panel

    assert _count_panel(panel) == (5, 2)


def test_get_tool_panel_reports_the_count_alongside_the_hierarchy():
    class PanelGalaxy(FakeGalaxy):
        async def get(self, path):
            self.manifest.require("read")
            self.calls.append(("GET", path))
            return [
                {"model_class": "ToolSection", "elems": [{"model_class": "Tool", "id": "a"},
                                                         {"model_class": "Tool", "id": "b"}]},
                {"model_class": "Tool", "id": "c"},
            ]

    sub = FakeSubstrate(("read",))
    sub.galaxy = PanelGalaxy(sub.manifest)
    out = asyncio.run(ToolSurface(sub).dispatch("get_tool_panel", {})).text
    assert '"tool_count": 3' in out.replace("'", '"') or '"tool_count":3' in out.replace(" ", "")
    assert "section_count" in out


def test_create_page_declares_markdown_so_galaxy_does_not_sanitize_it_as_html():
    # Galaxy defaults a page to html and runs the body through sanitize_html; markdown
    # sent without the format lands mangled or empty.
    sub = FakeSubstrate(("read", "write"))
    asyncio.run(ToolSurface(sub).dispatch(
        "create_page", {"title": "T", "slug": "s", "content": "## Heading\n\ntext"}))
    method, path, body = sub.galaxy.calls[0]
    assert (method, path) == ("POST", "api/pages")
    assert body["content_format"] == "markdown"


def test_history_details_uses_the_count_galaxy_already_reports():
    """Listing every content id to length it made this call grow with the history."""
    from olite.drivers.loop import galaxy_tools

    class Counting:
        def __init__(self):
            self.paths = []

        async def get(self, path):
            self.paths.append(path)
            return {"id": "h1", "name": "Analysis", "count": 42}

    galaxy = Counting()
    out = asyncio.run(galaxy_tools.get_handler("get_history_details")(galaxy, {"history_id": "h1"}))
    assert out["contents_summary"]["total_items"] == 42
    assert galaxy.paths == ["api/histories/h1"]


def test_history_details_reports_no_items_when_galaxy_states_none():
    from olite.drivers.loop import galaxy_tools

    class Empty:
        async def get(self, path):
            return {"id": "h1"}

    out = asyncio.run(galaxy_tools.get_handler("get_history_details")(Empty(), {"history_id": "h1"}))
    assert out["contents_summary"]["total_items"] == 0


def test_an_unreadable_preview_says_why():
    """An absent preview field reads the same as a dataset with no content."""
    from olite.drivers.loop import galaxy_tools

    class Unreadable:
        async def get(self, path, **kwargs):
            if path.endswith("/display") or "ck_size" in path:
                raise RuntimeError("dataset is in state 'running'")
            return {"id": "d1", "state": "running"}

    out = asyncio.run(galaxy_tools.get_handler("get_dataset_details")(Unreadable(), {"dataset_id": "d1"}))
    assert "preview" not in out
    assert "running" in out["preview_unavailable"]


def test_invoke_workflow_passes_parameters_normalized_through():
    from olite.drivers.loop import galaxy_tools

    class Posting:
        async def post(self, path, body):
            self.body = body
            return {"id": "inv1"}

    galaxy = Posting()
    asyncio.run(galaxy_tools.get_handler("invoke_workflow")(
        galaxy, {"workflow_id": "w1", "inputs": {}, "parameters_normalized": True}))
    assert galaxy.body["parameters_normalized"] is True
