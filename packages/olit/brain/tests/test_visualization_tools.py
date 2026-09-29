"""Showing a visualization renders it; saving is what puts an object in Galaxy."""

import asyncio
from urllib.parse import parse_qs, urlparse

from olit.loop import artifacts
from olit.loop.visualizations import (
    _save_visualization,
    _show_visualization,
    get_visualization_options,
)

from .fakes import refused

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


def save(g, charts=None, **args):
    return asyncio.run(_save_visualization(g, charts or Charts(), {"dataset_id": "d1", **args}))


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
    out = save(g, visualization="atlas", visualization_id="v9", settings={"x_axis_label": "Time"})

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
    out = refused(save(g, visualization="igv", tracks=[{"dataset_id": "d1"}]))

    assert out["saved"] is False and g.posted is None
    assert "dataset_id" in out["error"]
    assert "urlDataset" in out["declared"]
    assert "get_visualization_details" in out["hint"]


def test_the_declared_track_key_is_accepted():
    g = DeclaringGalaxy()
    charts = Charts([{"label": "d1", "value": {"id": "d1"}}])
    out = save(g, charts, visualization="igv", tracks=[{"urlDataset": {"id": "d1"}, "displayMode": "EXPANDED"}])
    assert out["saved"] is True and g.posted is not None


def test_a_plugin_declaring_nothing_is_not_treated_as_allowing_nothing():
    g = Galaxy()
    assert save(g, visualization="atlas", settings={"anything": 1})["saved"] is True


def test_settings_sent_as_a_list_is_refused():
    """A list of one-key objects is not what the form writes, and Galaxy stores it anyway."""
    g = DeclaringGalaxy()
    out = refused(save(g, visualization="igv", settings=[{"locus": "chr1:1-100"}]))
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
    out = refused(save(g, visualization="igv", settings={"genome": "hg38"}))
    assert out["saved"] is False and g.posted is None
    assert "whole entry" in out["error"]
    assert out["expected"]["required"] == ["id"]
    assert "get_visualization_options" in out["hint"]


CONDITIONAL_PLUGIN = {
    "name": "igv",
    "settings": [
        {"name": "locus", "type": "text"},
        {
            "name": "source",
            "type": "conditional",
            "test_param": {"name": "origin", "type": "select"},
            "cases": [
                {"value": "igv", "inputs": [{"name": "genome", "type": "data_json"}]},
                {"value": "builtin", "inputs": [{"name": "dbkey", "type": "data_table"}]},
            ],
        },
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
    out = refused(
        save(g, visualization="igv", settings={"locus": "chr1:1-2", "origin": "igv", "genome": {"id": "hg38"}})
    )
    assert out["saved"] is False and g.posted is None
    assert "declares no parameter" in out["error"]
    assert sorted(out["declared"]) == ["locus", "source"]


def test_the_nested_form_is_accepted():
    g = ConditionalGalaxy()
    charts = Charts([{"label": "hg38", "value": {"id": "hg38"}}])
    out = save(
        g,
        charts,
        visualization="igv",
        settings={"locus": "chr1:1-2", "source": {"origin": "igv", "genome": {"id": "hg38"}}},
    )
    assert out["saved"] is True
    assert g.posted[1]["config"]["settings"]["source"]["genome"] == {"id": "hg38"}


class Charts:
    """galaxy-charts, as far as the policy around it is concerned."""

    def __init__(self, offered=None, success=True):
        self.offered, self.success, self.asked = offered or [], success, []

    async def get_options(self, declared_input, context=None):
        self.asked.append(declared_input.get("name"))
        return {"success": self.success, "data": self.offered}


def test_a_case_parameter_is_only_valid_for_the_chosen_case():
    """`genome` belongs to the igv case; under builtin the conditional declares dbkey instead."""
    g = ConditionalGalaxy()
    out = refused(save(g, visualization="igv", settings={"source": {"origin": "builtin", "genome": {"id": "hg19"}}}))
    assert out["saved"] is False
    assert "genome" in out["error"]


def test_a_case_label_the_conditional_does_not_declare_is_refused():
    g = ConditionalGalaxy()
    out = refused(save(g, visualization="igv", settings={"source": {"origin": "remote"}}))
    assert out["saved"] is False
    assert "selects the case" in out["error"]
    assert "'igv'" in out["error"] and "'builtin'" in out["error"]


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
    plugin = {
        "name": "igv",
        "tracks": [
            {"name": "type", "type": "select"},
            {"name": "x", "type": "data_column"},
        ],
    }

    class G(DeclaringGalaxy):
        async def get(self, path, **kwargs):
            if path == "api/plugins/igv":
                return plugin
            return await super().get(path, **kwargs)

    g = G()
    out = refused(save(g, visualization="igv", tracks=[{"type": {"value": "scatter"}}]))
    assert out["saved"] is False and g.posted is None
    assert "stores string" in out["error"] and "not the entry" in out["error"]

    assert refused(save(g, visualization="igv", tracks=[{"x": {"column": "col2", "src": "hda"}}]))["saved"] is False

    # The value itself still saves, for a column this dataset offers.
    charts = Charts([{"label": "c2", "value": "2"}])
    assert save(g, charts, visualization="igv", tracks=[{"type": "scatter", "x": "2"}])["saved"] is True


def test_an_empty_case_names_the_siblings_that_might_not_be():
    """IGV declares builtin genomes as a data table an admin may never have filled.

    Five of 33 recorded runs picked that case, found nothing, and stopped: the answer was
    accurate and useless. The other cases are in the declaration already, so saying them
    costs no request and turns a dead end into a second try.
    """
    plugin = {
        "name": "igv",
        "settings": [
            {
                "name": "source",
                "type": "conditional",
                "test_param": {"name": "origin"},
                "cases": [
                    {
                        "value": "builtin",
                        "inputs": [{"name": "genome", "type": "data_table", "tables": ["empty_table"]}],
                    },
                    {
                        "value": "igv",
                        "inputs": [
                            {"name": "genome", "type": "data_json", "url": "https://example.invalid/genomes.json"}
                        ],
                    },
                ],
            }
        ],
    }

    class Galaxy:
        async def get(self, path, **kwargs):
            if path.startswith("api/plugins/"):
                return plugin
            return {"columns": [], "fields": []}

    out = asyncio.run(
        get_visualization_options(
            Galaxy(),
            Charts([]),
            {
                "visualization": "igv",
                "parameter": "settings.source.genome",
                "config": {"settings": {"source": {"origin": "builtin"}}},
            },
        )
    )
    assert out["total"] == 0
    assert out["other_cases"] == ["igv"]
    assert "try one of those" in out["hint"]


def test_a_case_that_has_options_says_nothing_about_its_siblings():
    plugin = {
        "name": "igv",
        "settings": [
            {
                "name": "source",
                "type": "conditional",
                "test_param": {"name": "origin"},
                "cases": [
                    {"value": "builtin", "inputs": [{"name": "genome", "type": "data_table", "tables": ["t"]}]},
                    {"value": "igv", "inputs": [{"name": "genome", "type": "data_json", "url": "u"}]},
                ],
            }
        ],
    }

    class Galaxy:
        async def get(self, path, **kwargs):
            if path.startswith("api/plugins/"):
                return plugin
            return {"columns": ["value", "name"], "fields": [["hg38", "Human"]]}

    out = asyncio.run(
        get_visualization_options(
            Galaxy(),
            Charts([{"label": "Human", "value": {"id": "hg38"}}]),
            {
                "visualization": "igv",
                "parameter": "settings.source.genome",
                "config": {"settings": {"source": {"origin": "builtin"}}},
            },
        )
    )
    assert out["total"] == 1
    assert "other_cases" not in out


OFFERED_MM10 = {
    "id": "mm10",
    "name": "Mouse (GRCm38/mm10)",
    "fastaURL": "https://s3.amazonaws.com/igv.broadinstitute.org/genomes/seq/mm10/mm10.fa",
    "tracks": [{"name": "Refseq Genes", "format": "refgene"}],
}
INVENTED_MM10 = {
    "id": "mm10",
    "name": "Mouse (GRCm38/mm10)",
    "fastaURL": "https://igv-genepattern-org.s3.amazonaws.com/genomes/seq/mm10/mm10.fa",
    "tracks": [],
}


def igv_genome(g, charts, genome):
    return save(g, charts, visualization="igv", settings={"source": {"origin": "igv", "genome": genome}})


def test_a_genome_the_server_offers_is_saved():
    g = ConditionalGalaxy()
    out = igv_genome(g, Charts([{"label": "mm10", "value": OFFERED_MM10}]), OFFERED_MM10)

    assert out["saved"] is True
    assert g.posted[1]["config"]["settings"]["source"]["genome"] == OFFERED_MM10


def test_a_genome_written_from_memory_is_refused():
    g = ConditionalGalaxy()
    out = refused(igv_genome(g, Charts([{"label": "mm10", "value": OFFERED_MM10}]), INVENTED_MM10))

    assert out["saved"] is False and g.posted is None
    assert "source.genome" in out["error"]
    assert "get_visualization_options" in out["hint"]


def test_a_value_naming_the_right_entry_with_fewer_fields_is_refused_and_says_so():
    g = ConditionalGalaxy()
    partial = {"id": OFFERED_MM10["id"], "name": OFFERED_MM10["name"]}
    out = refused(igv_genome(g, Charts([{"label": "mm10", "value": OFFERED_MM10}]), partial))

    assert "does not exactly match" in out["error"]
    assert "complete `value` unchanged" in out["hint"]


def test_a_case_that_offers_nothing_names_the_cases_that_might():
    """A live run held an igv-catalog genome under `builtin`, whose data table is empty here, and
    resent it nine times: the refusal counted zero without saying which case it counted for."""
    g = ConditionalGalaxy()
    out = refused(igv_genome(g, Charts([]), OFFERED_MM10))

    assert out["saved"] is False and g.posted is None
    assert "origin='igv'" in out["error"], "the case it resolved under"
    assert "builtin" in out["hint"], "the case that might hold it instead"
    assert out["other_cases"] == ["builtin"]


def test_a_lookup_that_could_not_be_made_does_not_block_a_save():
    g = ConditionalGalaxy()
    out = igv_genome(g, Charts([], success=False), INVENTED_MM10)

    assert out["saved"] is True


def test_the_value_an_input_holds_by_default_is_accepted():
    """plotly's `y` offers only real columns, so a declared default is not among them."""
    plugin = {"name": "igv", "tracks": [{"name": "x", "type": "data_column", "is_auto": "true"}]}

    class G(DeclaringGalaxy):
        async def get(self, path, **kwargs):
            return plugin if path == "api/plugins/igv" else await super().get(path, **kwargs)

    out = save(G(), Charts([{"label": "c1", "value": "1"}]), visualization="igv", tracks=[{"x": "auto"}])

    assert out["saved"] is True


def test_the_guard_is_driven_by_the_type_contract_not_by_the_plugin():
    plugin = {
        "name": "atlas",
        "settings": [{"name": "table", "type": "data_table", "tables": ["anything"]}],
    }

    class G(Galaxy):
        async def get(self, path, **kwargs):
            if path == "api/plugins/atlas":
                return plugin
            if path.startswith("api/plugins?"):
                return [{"name": "atlas"}]
            return await super().get(path, **kwargs)

    offered = Charts([{"label": "a", "value": {"id": "a", "columns": ["path"]}}])
    stored = {"table": {"id": "a", "columns": ["path"]}}
    assert save(G(), offered, visualization="atlas", settings=stored)["saved"] is True
    invented = refused(save(G(), offered, visualization="atlas", settings={"table": {"id": "b"}}))
    assert invented["saved"] is False
    assert offered.asked == ["table", "table"]


# A conditional whose test parameter declares a default.
DEFAULTED = {
    "name": "atlas",
    "settings": [
        {
            "name": "source",
            "type": "conditional",
            "test_param": {"name": "origin", "type": "select", "value": "hosted"},
            "cases": [
                {"value": "hosted", "inputs": [{"name": "entry", "type": "data_table", "tables": ["t"]}]},
                {"value": "history", "inputs": [{"name": "entry", "type": "data", "tables": []}]},
            ],
        }
    ],
}


class DefaultedGalaxy(Galaxy):
    async def get(self, path, **kwargs):
        if path == "api/plugins/atlas":
            return DEFAULTED
        if path.startswith("api/plugins?"):
            return [{"name": "atlas"}]
        return await super().get(path, **kwargs)


def test_a_config_that_names_no_case_is_read_against_the_declared_default():
    """`formatConditional` falls back to test_param.value, so the default case is in play."""
    offered = Charts([{"label": "a", "value": {"id": "a"}}])
    out = save(DefaultedGalaxy(), offered, visualization="atlas", settings={"source": {"entry": {"id": "a"}}})

    assert out["saved"] is True
    assert offered.asked == ["entry"]


def test_a_value_outside_the_default_case_options_is_still_refused():
    out = refused(
        save(
            DefaultedGalaxy(),
            Charts([{"label": "a", "value": {"id": "a"}}]),
            visualization="atlas",
            settings={"source": {"entry": {"id": "b"}}},
        )
    )

    assert out["saved"] is False


class ContextCharts(Charts):
    """galaxy-charts as it answers a history-dataset input: nothing without a dataset to key on."""

    async def get_options(self, declared_input, context=None):
        self.asked.append((context or {}).get("datasetId"))
        if not (context or {}).get("datasetId"):
            return {"success": True, "data": []}
        return {"success": True, "data": self.offered}


def test_a_refusal_names_the_dataset_its_options_were_resolved_with():
    """The asymmetry that looped a live run: the agent asked without a dataset_id, was answered
    with an empty list, and could not produce the value the save demanded."""
    offered = [{"label": "tracks.bed", "value": {"id": "d1", "name": "tracks.bed"}}]
    charts = ContextCharts(offered)
    plugin = {"name": "igv", "tracks": [{"name": "urlDataset", "type": "data"}]}

    class G(DeclaringGalaxy):
        async def get(self, path, **kwargs):
            return plugin if path == "api/plugins/igv" else await super().get(path, **kwargs)

    without = asyncio.run(charts.get_options({"name": "urlDataset", "type": "data"}, {}))
    assert without["data"] == [], "the agent's own call, with no dataset_id, resolves nothing"

    out = refused(save(G(), charts, visualization="igv", tracks=[{"urlDataset": {"id": "d1"}}]))

    assert out["saved"] is False
    assert "1 value(s) are offered" in out["hint"], "the save resolved them, keyed on its dataset"
    assert "dataset_id='d1'" in out["hint"]
