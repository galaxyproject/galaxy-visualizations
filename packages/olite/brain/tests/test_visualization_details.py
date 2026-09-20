"""One plugin's parameters, with the schema when Galaxy publishes one."""
import asyncio

from olite.drivers.loop.galaxy_tools import _get_visualization_details

SCHEMA = {"type": "object", "properties": {"tracks": {"type": "array"}}}


class Galaxy:
    def __init__(self, plugin):
        self.plugin, self.asked = plugin, []

    async def get(self, path, **kwargs):
        self.asked.append(path)
        return self.plugin


def run(plugin):
    g = Galaxy(plugin)
    return g, asyncio.run(_get_visualization_details(g, {"visualization": "igv"}))


def test_it_asks_for_the_one_plugin_rather_than_listing_them():
    g, _ = run({"name": "igv"})
    assert g.asked == ["api/plugins/igv"]


def test_the_schema_is_passed_through_when_galaxy_publishes_one():
    _, out = run({"name": "igv", "description": "Explore Genomic Data",
                  "settings": [{"name": "locus"}], "tracks": [{"name": "urlDataset"}],
                  "parameters_schema": SCHEMA})
    assert out["parameters_schema"] == SCHEMA
    assert out["settings"] == ["locus"] and out["tracks"] == ["urlDataset"]
    assert "save_visualization" in out["hint"]


def test_a_galaxy_without_the_schema_says_so_rather_than_inviting_a_guess():
    _, out = run({"name": "igv", "settings": [{"name": "locus"}], "tracks": []})
    assert "parameters_schema" not in out
    assert "does not publish a parameter schema" in out["hint"]
    assert "show_visualization" in out["hint"]


def test_an_unknown_visualization_is_refused():
    _, out = run({})
    assert "not an installed visualization" in out["error"]
