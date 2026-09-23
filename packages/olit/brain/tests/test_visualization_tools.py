"""Showing a visualization renders it; saving is what puts an object in Galaxy."""
import asyncio
from urllib.parse import parse_qs, urlparse

from olit.drivers.loop import artifacts
from olit.drivers.loop.galaxy_tools import (
    _get_visualization_options,
    _save_visualization,
    _show_visualization,
)

INSTALLED = [{"name": "atlas"}, {"name": "aladin"}]


class Galaxy:
    def __init__(self, compatible=("atlas",)):
        self.compatible, self.posted, self.put_to = compatible, None, None

    async def get(self, path, **kwargs):
        if path.startswith("api/datasets/"):
            return {"extension": "tabular", "name": "sample.tabular"}
        if path.startswith("api/plugins?"):
            return [{"name": n} for n in self.compatible]
        if path == "api/plugins":
            return INSTALLED
        return []

    async def post(self, path, body):
        self.posted = (path, body)
        return {"id": "v1"}

    async def put(self, path, body=None):
        self.put_to = (path, body)
        return {"id": path.rsplit("/", 1)[-1]}


def show(g, **args):
    return asyncio.run(_show_visualization(g, {"dataset_id": "d1", **args}))


def save(g, **args):
    return asyncio.run(_save_visualization(g, {"dataset_id": "d1", **args}))


def query_of(result):
    return parse_qs(urlparse(result["artifact"]["url"]).query)


def test_showing_puts_nothing_in_galaxy():
    g = Galaxy()
    out = show(g, visualization="atlas")
    assert out["shown"] is True
    assert g.posted is None, "rendering must not create a saved visualization"


def test_the_shown_address_names_the_plugin():
    """Galaxy reads the plugin name from the query; without it the page renders nothing."""
    g = Galaxy()
    q = query_of(show(g, visualization="atlas"))
    assert q["visualization"] == ["atlas"]
    assert q["dataset_id"] == ["d1"]
    assert "visualization_id" not in q


def test_the_shown_address_asks_for_a_bare_page():
    g = Galaxy()
    q = query_of(show(g, visualization="atlas"))
    assert q["hide_panels"] == ["true"] and q["hide_masthead"] == ["true"]


def test_the_saved_address_names_the_plugin_beside_the_id():
    g = Galaxy()
    q = query_of(save(g, visualization="atlas"))
    assert q["visualization"] == ["atlas"] and q["visualization_id"] == ["v1"]


def test_a_visualization_the_server_does_not_have_is_refused_either_way():
    for call, key in ((show, "shown"), (save, "saved")):
        g = Galaxy()
        out = call(g, visualization="not_installed")
        assert out[key] is False and g.posted is None
        assert "not an installed visualization" in out["error"]


def test_an_installed_visualization_that_cannot_render_the_dataset_is_refused_either_way():
    for call, key in ((show, "shown"), (save, "saved")):
        g = Galaxy(compatible=("atlas",))
        out = call(g, visualization="aladin")
        assert out[key] is False and g.posted is None
        assert out["can_render_it"] == ["atlas"]


def test_saving_records_the_dataset_in_its_config():
    g = Galaxy()
    out = save(g, visualization="atlas", title="A table")
    assert out["saved"] is True
    path, body = g.posted
    assert path == "api/visualizations"
    assert body["type"] == "atlas" and body["title"] == "A table"
    assert body["config"] == {"dataset_id": "d1"}


def test_a_missing_title_falls_back_to_the_dataset_name():
    g = Galaxy()
    assert save(g, visualization="atlas") and g.posted[1]["title"] == "atlas of sample.tabular"
    assert show(Galaxy(), visualization="atlas")["title"] == "atlas of sample.tabular"


def test_settings_and_tracks_reach_the_saved_config():
    g = Galaxy()
    save(g, visualization="atlas", settings={"x_axis_label": "Time"}, tracks=[{"x": "1"}])
    config = g.posted[1]["config"]
    assert config["settings"] == {"x_axis_label": "Time"}
    assert config["tracks"] == [{"x": "1"}]


def test_nothing_optional_is_sent_when_not_given():
    g = Galaxy()
    save(g, visualization="atlas")
    assert g.posted[1]["config"] == {"dataset_id": "d1"}


def test_a_saved_visualization_is_revised_rather_than_duplicated():
    """Settings can only ride in a saved config, so changing them must not add a row."""
    g = Galaxy()
    out = save(g, visualization="atlas", visualization_id="v9",
               settings={"x_axis_label": "Time"})

    assert g.posted is None, "revising must not create a second visualization"
    path, body = g.put_to
    assert path == "api/visualizations/v9"
    assert body["config"]["settings"] == {"x_axis_label": "Time"}
    assert out["visualization_id"] == "v9"


def test_the_revised_address_still_names_the_plugin():
    g = Galaxy()
    q = query_of(save(g, visualization="atlas", visualization_id="v9"))
    assert q["visualization"] == ["atlas"] and q["visualization_id"] == ["v9"]


IGV_PLUGIN = {
    "name": "igv",
    "settings": [{"name": "locus", "type": "text"}],
    "tracks": [{"name": "urlDataset", "type": "data"}, {"name": "displayMode", "type": "select"}],
}


class DeclaringGalaxy(Galaxy):
    async def get(self, path, **kwargs):
        if path == "api/plugins/igv":
            return IGV_PLUGIN
        if path.startswith("api/plugins?"):
            return [{"name": "igv"}]
        if path == "api/plugins":
            return [{"name": "igv"}]
        return await super().get(path, **kwargs)


def test_a_track_key_the_plugin_does_not_declare_is_refused():
    """The shape is published; inventing a key produces a track no plugin reads."""
    g = DeclaringGalaxy()
    out = save(g, visualization="igv", tracks=[{"dataset_id": "d1"}])

    assert out["saved"] is False and g.posted is None
    assert "dataset_id" in out["error"]
    assert "urlDataset" in out["declared"]
    assert "get_visualization_details" in out["hint"]


def test_the_declared_track_key_is_accepted():
    g = DeclaringGalaxy()
    out = save(g, visualization="igv", tracks=[{"urlDataset": {"id": "d1"}, "displayMode": "EXPANDED"}])
    assert out["saved"] is True and g.posted is not None


def test_a_plugin_declaring_nothing_is_not_treated_as_allowing_nothing():
    g = Galaxy()
    assert save(g, visualization="atlas", settings={"anything": 1})["saved"] is True


def test_settings_sent_as_a_list_is_refused():
    """A list of one-key objects is not what the form writes, and Galaxy stores it anyway."""
    g = DeclaringGalaxy()
    out = save(g, visualization="igv", settings=[{"locus": "chr1:1-100"}])
    assert out["saved"] is False and g.posted is None
    assert "one object keyed by parameter name" in out["error"]


def test_an_object_valued_parameter_refuses_a_bare_id():
    g = DeclaringGalaxy()
    plugin = dict(IGV_PLUGIN, settings=[{"name": "genome", "type": "data"}])

    class G(DeclaringGalaxy):
        async def get(self, path, **kwargs):
            if path == "api/plugins/igv":
                return plugin
            return await super().get(path, **kwargs)

    g = G()
    out = save(g, visualization="igv", settings={"genome": "hg38"})
    assert out["saved"] is False and g.posted is None
    assert "whole entry" in out["error"]
    assert out["expected"]["required"] == ["id"]
    assert "get_visualization_options" in out["hint"]


CONDITIONAL_PLUGIN = {
    "name": "igv",
    "settings": [
        {"name": "locus", "type": "text"},
        {"name": "source", "type": "conditional",
         "test_param": {"name": "origin", "type": "select"},
         "cases": [{"value": "igv", "inputs": [{"name": "genome", "type": "data_json"}]}]},
    ],
    "tracks": [{"name": "urlDataset", "type": "data"}],
}


class ConditionalGalaxy(Galaxy):
    async def get(self, path, **kwargs):
        if path == "api/plugins/igv":
            return CONDITIONAL_PLUGIN
        if path.startswith("api/plugins"):
            return [{"name": "igv"}]
        return await super().get(path, **kwargs)


def test_a_conditionals_parameters_may_not_be_flattened_beside_it():
    """galaxy-charts nests them under the conditional; flat is a shape it never writes."""
    g = ConditionalGalaxy()
    out = save(g, visualization="igv",
               settings={"locus": "chr1:1-2", "origin": "igv", "genome": {"id": "hg38"}})
    assert out["saved"] is False and g.posted is None
    assert "declares no parameter" in out["error"]
    assert sorted(out["declared"]) == ["locus", "source"]


def test_the_nested_form_is_accepted():
    g = ConditionalGalaxy()
    out = save(g, visualization="igv",
               settings={"locus": "chr1:1-2",
                         "source": {"origin": "igv", "genome": {"id": "hg38"}}})
    assert out["saved"] is True
    assert g.posted[1]["config"]["settings"]["source"]["genome"] == {"id": "hg38"}


def test_a_case_parameter_is_only_valid_for_the_chosen_case():
    g = ConditionalGalaxy()
    out = save(g, visualization="igv",
               settings={"source": {"origin": "builtin", "genome": {"id": "hg19"}}})
    assert out["saved"] is False
    assert "genome" in out["error"]


def test_both_visualization_tools_hand_back_an_artifact_that_embeds_them():
    """The page directive takes the plugin name and the dataset; the saved id renders nothing.

    The agent wrote `visualization(visualization_id=<saved id>)` into a record and Galaxy
    answered "Missing history_dataset_id for visualization".
    """
    g = Galaxy()
    expected = "```galaxy\nvisualization(visualization_id=atlas, history_dataset_id=d1)\n```"

    assert artifacts.render(show(g, visualization="atlas")["artifact"]) == expected
    saved = save(g, visualization="atlas")
    assert artifacts.render(saved["artifact"]) == expected
    # The saved object's own id is not what the directive takes.
    assert saved["visualization_id"] not in artifacts.render(saved["artifact"])


def test_a_scalar_parameter_refuses_the_entry_it_was_chosen_from():
    """The inverse of the check above, and the one that shipped a broken plotly config.

    A saved plotly track held {"value": "scatter"} for a select and {"column": "col2", ...}
    for a data_column. Galaxy type-checks neither, so the plugin read none of them.
    """
    plugin = {"name": "igv", "tracks": [
        {"name": "type", "type": "select"},
        {"name": "x", "type": "data_column"},
    ]}

    class G(DeclaringGalaxy):
        async def get(self, path, **kwargs):
            if path == "api/plugins/igv":
                return plugin
            return await super().get(path, **kwargs)

    g = G()
    out = save(g, visualization="igv", tracks=[{"type": {"value": "scatter"}}])
    assert out["saved"] is False and g.posted is None
    assert "stores string" in out["error"] and "not the entry" in out["error"]

    assert save(g, visualization="igv", tracks=[{"x": {"column": "col2", "src": "hda"}}])["saved"] is False

    # The value itself still saves.
    assert save(g, visualization="igv", tracks=[{"type": "scatter", "x": "2"}])["saved"] is True


def test_an_empty_case_names_the_siblings_that_might_not_be():
    """IGV declares builtin genomes as a data table an admin may never have filled.

    Five of 33 recorded runs picked that case, found nothing, and stopped: the answer was
    accurate and useless. The other cases are in the declaration already, so saying them
    costs no request and turns a dead end into a second try.
    """
    plugin = {
        "name": "igv",
        "settings": [{
            "name": "source", "type": "conditional",
            "test_param": {"name": "origin"},
            "cases": [
                {"value": "builtin", "inputs": [{"name": "genome", "type": "data_table",
                                                 "tables": ["empty_table"]}]},
                {"value": "igv", "inputs": [{"name": "genome", "type": "data_json",
                                             "url": "https://example.invalid/genomes.json"}]},
            ],
        }],
    }

    class Galaxy:
        async def get(self, path, **kwargs):
            if path.startswith("api/plugins/"):
                return plugin
            return {"columns": [], "fields": []}

    out = asyncio.run(_get_visualization_options(
        Galaxy(), {"visualization": "igv", "parameter": "genome", "when": "builtin"}))
    assert out["total"] == 0
    assert out["other_cases"] == ["igv"]
    assert "try one of those" in out["hint"]


def test_a_case_that_has_options_says_nothing_about_its_siblings():
    plugin = {
        "name": "igv",
        "settings": [{
            "name": "source", "type": "conditional",
            "test_param": {"name": "origin"},
            "cases": [
                {"value": "builtin", "inputs": [{"name": "genome", "type": "data_table",
                                                 "tables": ["t"]}]},
                {"value": "igv", "inputs": [{"name": "genome", "type": "data_json", "url": "u"}]},
            ],
        }],
    }

    class Galaxy:
        async def get(self, path, **kwargs):
            if path.startswith("api/plugins/"):
                return plugin
            return {"columns": ["value", "name"], "fields": [["hg38", "Human"]]}

    out = asyncio.run(_get_visualization_options(
        Galaxy(), {"visualization": "igv", "parameter": "genome", "when": "builtin"}))
    assert out["total"] == 1
    assert "other_cases" not in out
