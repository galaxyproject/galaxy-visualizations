"""Revising a saved visualization means reading its config, not rebuilding it."""
import asyncio

from olit.drivers.loop.galaxy_tools import _get_visualization

from .fakes import refused

SAVED = {
    "id": "v1",
    "type": "igv",
    "title": "Peptide tracks",
    "latest_revision": {
        "config": {
            "dataset_id": "d1",
            "settings": {"locus": "chr1:100-200"},
            "tracks": [{"urlDataset": {"id": "d1"}, "name": "genes"}],
        }
    },
}


class Galaxy:
    def __init__(self, saved):
        self.saved = saved

    async def get(self, path, **kwargs):
        return self.saved


def read(saved):
    return asyncio.run(_get_visualization(Galaxy(saved), {"visualization_id": "v1"}))


def test_the_current_settings_and_tracks_come_back():
    out = read(SAVED)
    assert out["visualization"] == "igv" and out["dataset_id"] == "d1"
    assert out["settings"] == {"locus": "chr1:100-200"}
    assert out["tracks"] == [{"urlDataset": {"id": "d1"}, "name": "genes"}]


def test_it_says_that_a_write_replaces_rather_than_merges():
    assert "dropped" in read(SAVED)["hint"]


def test_a_visualization_with_no_config_yet_reads_as_empty_not_missing():
    out = read({"id": "v1", "type": "igv", "latest_revision": {}})
    assert out["settings"] == {} and out["tracks"] == []
    assert "error" not in out


def test_an_unknown_visualization_is_refused():
    assert "No saved visualization" in refused(read({}))["error"]
