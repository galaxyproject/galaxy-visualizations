"""list_workflows filters on name and tags, ignoring separators.

Galaxy's own `?search` drops raw terms shorter than four characters
(DEFAULT_MIN_RAW_TERM_LENGTH), so delegating "rna seq" to it returns every workflow.
"""

import asyncio

from olite.drivers.loop.galaxy_tools import _list_workflows

WORKFLOWS = [
    {"id": "w1", "name": "RNA-seq quantification (paired-end)", "tags": ["rna-seq", "transcriptomics"]},
    {"id": "w2", "name": "RNAseq differential expression", "tags": ["rna-seq"]},
    {"id": "w3", "name": "Germline variant calling", "tags": ["variants", "dna"]},
    {"id": "w4", "name": "ChIP-seq peak calling", "tags": ["chip-seq", "epigenomics"]},
    {"id": "w5", "name": "Read quality control and trimming", "tags": ["qc"]},
]


class FakeGalaxy:
    def __init__(self):
        self.paths = []

    async def get(self, path, binary=False):
        self.paths.append(path)
        return list(WORKFLOWS)


def names(**args):
    return [w["name"] for w in asyncio.run(_list_workflows(FakeGalaxy(), args))]


def test_unfiltered_returns_every_workflow():
    assert len(names()) == 5


def test_a_spaced_query_matches_a_hyphenated_name():
    assert names(name="rna seq") == [
        "RNA-seq quantification (paired-end)", "RNAseq differential expression"]


def test_separator_variants_agree():
    assert names(name="rna-seq") == names(name="rnaseq") == names(name="rna seq")


def test_a_tag_matches_when_the_name_does_not():
    assert names(name="qc") == ["Read quality control and trimming"]


def test_an_unrelated_query_matches_nothing():
    assert names(name="proteomics") == []


def test_the_filter_is_not_delegated_to_galaxy_search():
    g = FakeGalaxy()
    asyncio.run(_list_workflows(g, {"name": "rna seq"}))
    assert "search" not in g.paths[0]


def test_workflow_id_selects_one():
    assert names(workflow_id="w3") == ["Germline variant calling"]
