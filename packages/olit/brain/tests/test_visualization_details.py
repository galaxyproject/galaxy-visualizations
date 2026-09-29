"""A plugin's inputs, joined with what galaxy-charts stores for each type."""

import asyncio

from olit.loop.visualizations import _get_visualization_details

from .fakes import refused

IGV = {
    "name": "igv",
    "description": "Explore Genomic Data",
    "settings": [
        {"name": "locus", "type": "text", "value": "all"},
        {
            "name": "source",
            "type": "conditional",
            "test_param": {
                "name": "origin",
                "type": "select",
                "data": [{"label": "IGV", "value": "igv"}, {"label": "History", "value": "history"}],
            },
            "cases": [
                {"value": "igv", "inputs": [{"name": "genome", "type": "data_json", "url": "https://x/g.json"}]},
                {"value": "history", "inputs": [{"name": "genome", "type": "data", "extension": "fasta,twobit"}]},
            ],
        },
    ],
    "tracks": [{"name": "urlDataset", "type": "data", "extension": "bam,bed"}],
}


class Galaxy:
    def __init__(self, plugin):
        self.plugin = plugin

    async def get(self, path, **kwargs):
        return self.plugin


def details(plugin=IGV):
    return asyncio.run(_get_visualization_details(Galaxy(plugin), {"visualization": "igv"}))


def test_a_dataset_input_states_the_object_it_stores():
    track = details()["tracks"][0]
    assert track["stores"]["type"] == "object"
    assert track["stores"]["required"] == ["id"]


def test_a_dataset_input_states_the_datatypes_it_accepts():
    """The distinction a caller needs: a genome is not a track."""
    track = details()["tracks"][0]
    assert track["options"] == {
        "kind": "history_dataset",
        "extension": "bam,bed",
        "resolve": "get_visualization_options",
        "pass_through": "the resolved option's `value`, unchanged",
    }


def test_a_conditional_is_expanded_into_its_cases():
    source = details()["settings"][1]
    assert [c["when"] for c in source["cases"]] == ["igv", "history"]
    assert source["chosen_by"]["name"] == "origin"

    history_genome = source["cases"][1]["inputs"][0]
    assert history_genome["options"]["extension"] == "fasta,twobit"
    assert history_genome["stores"]["required"] == ["id"]


def test_a_remote_option_source_names_where_to_fetch_it():
    igv_genome = details()["settings"][1]["cases"][0]["inputs"][0]
    assert igv_genome["options"] == {
        "kind": "data_json",
        "url": "https://x/g.json",
        "resolve": "get_visualization_options",
        "pass_through": "the resolved option's `value`, unchanged",
    }


def test_a_declared_source_carries_its_values_and_names_no_call():
    source = details()["settings"][1]
    assert "resolve" not in source["chosen_by"]["options"]


def test_a_plain_text_input_stores_a_string_and_claims_nothing_else():
    locus = details()["settings"][0]
    assert locus["stores"] == {"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "string"}
    assert "options" not in locus


def test_an_unknown_visualization_is_refused():
    assert "not an installed visualization" in refused(details({}))


def test_a_declared_default_is_published():
    """galaxy-charts resolves an unset input to it, so hiding it leaves the agent guessing."""
    assert details()["settings"][0]["default"] == "all"


def test_a_conditional_publishes_the_default_that_chooses_its_case():
    source = dict(IGV["settings"][1], test_param={"name": "origin", "type": "select", "value": "igv"})
    published = details({"name": "igv", "settings": [source]})["settings"][0]

    assert published["chosen_by"]["default"] == "igv"


def test_a_default_is_coerced_by_what_the_contract_declares():
    """The declaration carries XML strings; `coerce` says what each type stores."""
    plugin = {
        "name": "igv",
        "settings": [
            {"name": "show_legend", "type": "boolean", "value": "true"},
            {"name": "width", "type": "integer", "value": "800"},
            {"name": "ratio", "type": "float", "value": "1.5"},
            {"name": "title", "type": "text", "value": "800"},
        ],
    }
    published = {p["name"]: p["default"] for p in details(plugin)["settings"]}

    assert published == {"show_legend": True, "width": 800, "ratio": 1.5, "title": "800"}


def test_a_numeric_default_that_is_not_a_number_is_not_published():
    """Stating one would contradict the `stores` published beside it."""
    plugin = {"name": "igv", "settings": [{"name": "width", "type": "integer", "value": "wide"}]}

    assert "default" not in details(plugin)["settings"][0]
