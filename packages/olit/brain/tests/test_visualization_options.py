"""Where a parameter's options live, resolved rather than invented."""

import asyncio

from olit.drivers.loop.galaxy_tools import get_visualization_options

from .fakes import refused

PLUGIN = {
    "name": "igv",
    "settings": [
        {
            "name": "source",
            "type": "conditional",
            "test_param": {"name": "origin", "type": "select", "data": [{"label": "IGV", "value": "igv"}]},
            "cases": [
                {"value": "igv", "inputs": [{"name": "genome", "type": "data_json", "url": "https://x/g.json"}]},
                {"value": "builtin", "inputs": [{"name": "genome", "type": "data_table", "tables": ["fasta_indexes"]}]},
            ],
        },
    ],
    "tracks": [{"name": "displayMode", "type": "select", "data": [{"label": "Expanded", "value": "EXPANDED"}]}],
}


class Galaxy:
    async def get(self, path, **kwargs):
        return PLUGIN


class Charts:
    """galaxy-charts, as far as the policy around it is concerned."""

    def __init__(self, offered=None, message=None):
        self.offered = (
            offered
            if offered is not None
            else [
                {
                    "label": "Human hg19",
                    "value": {
                        "id": "hg19",
                        "columns": ["value", "name"],
                        "row": ["hg19", "Human hg19"],
                        "table": "fasta_indexes",
                    },
                }
            ]
        )
        self.message = message
        self.asked = []

    async def get_options(self, declared_input, context=None):
        self.asked.append((declared_input, context))
        if self.message:
            return {"success": False, "message": self.message}
        return {"success": True, "data": self.offered}


def call(charts=None, **kw):
    return asyncio.run(get_visualization_options(Galaxy(), charts or Charts(), {"visualization": "igv", **kw}))


def test_a_name_declared_in_several_cases_is_refused_rather_than_guessed():
    """igv declares `genome` per case with a different source each time."""
    out = refused(call(parameter="genome"))
    assert "more than one case" in out
    assert "builtin" in out and "igv" in out, "the cases it could not choose between"
    assert "`when`" in out, "the refusal has to say how to disambiguate"


def test_naming_the_case_resolves_the_right_source():
    assert call(parameter="genome", when="builtin")["source"] == "data_table"


def test_an_option_carries_the_value_to_store_whole():
    match = call(parameter="genome", when="builtin", search="hg19")["matches"][0]
    assert match["id"] == "hg19"
    assert match["value"]["table"] == "fasta_indexes"
    assert match["value"]["row"] == ["hg19", "Human hg19"]


def test_a_declared_select_is_offered_by_its_own_values():
    out = call(charts=Charts(offered=[{"label": "Expanded", "value": "EXPANDED"}]), parameter="displayMode")
    assert out["source"] == "declared"
    assert out["total"] == 1 and out["options"][0]["id"] == "EXPANDED"


def test_the_resolver_is_asked_for_the_declared_input_it_found():
    charts = Charts()
    call(charts=charts, parameter="genome", when="builtin")
    declared, context = charts.asked[0]
    assert declared["type"] == "data_table" and declared["tables"] == ["fasta_indexes"]
    assert "datasetId" in context


def test_a_failed_lookup_is_reported_rather_than_shown_as_no_options():
    out = refused(call(charts=Charts(message="no route to host"), parameter="genome", when="builtin"))
    assert "Could not resolve" in out and "no route to host" in out


def test_the_path_the_details_publish_resolves_to_the_declared_name():
    """get_visualization_details nests `genome` inside `source`, so a caller may name the path."""
    for parameter in ("source.genome", "settings.source.genome"):
        assert call(parameter=parameter, when="builtin")["source"] == "data_table"


def test_a_path_still_needs_its_case_named():
    """The path does not disambiguate: every case declares `genome` under the same conditional."""
    assert "more than one case" in refused(call(parameter="source.genome"))


def test_a_parameter_the_plugin_does_not_declare_is_refused():
    assert "declares no parameter" in refused(call(parameter="nonsense"))


def test_browsing_says_how_to_get_the_value_to_store():
    assert "search" in call(parameter="genome", when="builtin")["hint"]
