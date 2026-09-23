"""A renderable artifact reaches the shell, and only a reference reaches the model.

Driven through dispatch rather than the claim helper, because the defect this guards
against was serialization happening first: the helper alone passes either way.
"""

import asyncio
import json

from olit.drivers.loop.tools import ToolSurface

DATASET = "0f74b56904a59856"
VIZ = "33b43b4e7093c91f"


class Manifest:
    def allows(self, capability):
        return True

    def require(self, capability):
        return None


class Galaxy:
    """Enough of a server to let show_visualization reach its artifact."""

    def __init__(self):
        self.manifest = Manifest()

    async def get(self, path, **kwargs):
        if path.startswith("api/plugins"):
            return [{"name": "ngl", "settings": [], "tracks": []}]
        if path.startswith("api/datasets/"):
            return {"id": DATASET, "name": "peptide.pdb", "extension": "pdb"}
        return []

    async def post(self, path, body=None):
        return {"id": VIZ}


class Substrate:
    def __init__(self):
        self.manifest = Manifest()
        self.galaxy = Galaxy()


def _create():
    surface = ToolSurface(Substrate())
    outcome = asyncio.run(surface.dispatch(
        "show_visualization", {"dataset_id": DATASET, "visualization": "ngl"}))
    return surface, json.loads(outcome.text)


def test_the_shell_receives_a_renderable_artifact():
    surface, _ = _create()
    assert len(surface.artifacts) == 1
    artifact = surface.artifacts[0]
    assert artifact["kind"] == "visualization"
    assert "visualization=ngl" in artifact["url"]


def test_the_model_receives_a_reference_without_the_payload():
    _, result = _create()
    assert result["artifact"] == {"kind": "visualization", "title": result["title"]}


def test_a_tool_without_an_artifact_is_untouched():
    surface = ToolSurface(Substrate())
    outcome = asyncio.run(surface.dispatch("list_visualizations", {"dataset_id": DATASET}))
    assert surface.artifacts == []
    assert "visualizations" in json.loads(outcome.text)
