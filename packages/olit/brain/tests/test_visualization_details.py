"""A plugin's inputs, joined with what galaxy-charts stores for each type."""

import asyncio

from olit.drivers.loop.galaxy_tools import _get_visualization_details

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
    assert track["options"] == {"kind": "history_dataset", "extension": "bam,bed"}


def test_a_conditional_is_expanded_into_its_cases():
    source = details()["settings"][1]
    assert [c["when"] for c in source["cases"]] == ["igv", "history"]
    assert source["chosen_by"]["name"] == "origin"

    history_genome = source["cases"][1]["inputs"][0]
    assert history_genome["options"]["extension"] == "fasta,twobit"
    assert history_genome["stores"]["required"] == ["id"]


def test_a_remote_option_source_names_where_to_fetch_it():
    igv_genome = details()["settings"][1]["cases"][0]["inputs"][0]
    assert igv_genome["options"] == {"kind": "data_json", "url": "https://x/g.json"}


def test_a_plain_text_input_stores_a_string_and_claims_nothing_else():
    locus = details()["settings"][0]
    assert locus["stores"] == {"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "string"}
    assert "options" not in locus


def test_an_unknown_visualization_is_refused():
    assert "not an installed visualization" in refused(details({}))
