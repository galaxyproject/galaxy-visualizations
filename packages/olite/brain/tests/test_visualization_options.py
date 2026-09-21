"""Where a parameter's options live, resolved rather than invented."""
import asyncio

from olite.drivers.loop.galaxy_tools import _get_visualization_options

PLUGIN = {
    "name": "igv",
    "settings": [
        {
            "name": "source",
            "type": "conditional",
            "test_param": {"name": "origin", "type": "select",
                           "data": [{"label": "IGV", "value": "igv"}]},
            "cases": [
                {"value": "igv",
                 "inputs": [{"name": "genome", "type": "data_json", "url": "https://x/g.json"}]},
                {"value": "builtin",
                 "inputs": [{"name": "genome", "type": "data_table",
                             "tables": ["fasta_indexes"]}]},
            ],
        },
    ],
    "tracks": [{"name": "displayMode", "type": "select",
                "data": [{"label": "Expanded", "value": "EXPANDED"}]}],
}

TABLE = {"columns": ["value", "name"], "fields": [["hg19", "Human hg19"]]}


class Galaxy:
    async def get(self, path, **kwargs):
        if path.startswith("api/tool_data/"):
            return TABLE
        return PLUGIN


def call(**kw):
    return asyncio.run(_get_visualization_options(Galaxy(), {"visualization": "igv", **kw}))


def test_a_name_declared_in_several_cases_is_refused_rather_than_guessed():
    """igv declares `genome` per case with a different source each time."""
    out = call(parameter="genome")
    assert "more than one case" in out["error"]
    assert out["cases"] == ["builtin", "igv"]
    assert "`when`" in out["hint"]


def test_naming_the_case_resolves_the_right_source():
    assert call(parameter="genome", when="builtin")["source"] == "data_table"


def test_a_data_table_option_carries_the_row_it_came_from():
    match = call(parameter="genome", when="builtin", search="hg19")["matches"][0]
    assert match["id"] == "hg19" and match["table"] == "fasta_indexes"
    assert match["row"] == ["hg19", "Human hg19"]


def test_declared_options_need_no_fetching():
    out = call(parameter="displayMode")
    assert out["source"] == "declared"
    assert out["options"][0]["id"] is None or out["total"] == 1


def test_a_parameter_the_plugin_does_not_declare_is_refused():
    assert "declares no parameter" in call(parameter="nonsense")["error"]


def test_browsing_says_how_to_get_the_value_to_store():
    assert "search" in call(parameter="genome", when="builtin")["hint"]


def test_a_data_table_is_offered_once_per_id_and_ordered_by_it():
    """galaxy-charts' dataTableStore dedupes and sorts; the form shows that order."""
    import olite.drivers.loop.galaxy_tools as gt

    wide = {"columns": ["value", "name"],
            "fields": [["mm10", "Mouse"], ["hg19", "Human"], ["mm10", "Mouse again"]]}

    class Wide(Galaxy):
        async def get(self, path, **kwargs):
            return wide if path.startswith("api/tool_data/") else PLUGIN

    out = asyncio.run(gt._get_visualization_options(
        Wide(), {"visualization": "igv", "parameter": "genome", "when": "builtin"}))
    assert [o["id"] for o in out["options"]] == ["hg19", "mm10"]
    assert out["total"] == 2


def test_a_short_row_falls_back_to_its_first_column():
    """dataTableStore does the same, so a ragged table reads the same in both."""
    import olite.drivers.loop.galaxy_tools as gt

    ragged = {"columns": ["value", "name", "path"], "fields": [["hg38"]]}

    class Ragged(Galaxy):
        async def get(self, path, **kwargs):
            return ragged if path.startswith("api/tool_data/") else PLUGIN

    out = asyncio.run(gt._get_visualization_options(
        Ragged(), {"visualization": "igv", "parameter": "genome", "when": "builtin"}))
    assert out["options"] == [{"id": "hg38", "name": "hg38"}]
