"""Searching the IWC manifest matches what a workflow says, not how the entry is shaped."""

import asyncio

from olit.drivers.loop import galaxy_tools


class FakeGalaxy:
    manifest = type("M", (), {"require": staticmethod(lambda _cap: None)})()


MANIFEST = [
    {
        "workflows": [
            {"trsID": "#workflow/rnaseq", "categories": ["Transcriptomics"],
             "readme": "# RNAseq\n\nCounts reads per gene.",
             "authors": [{"name": "IWC", "orcid": "0000"}],
             "definition": {"name": "RNAseq counts", "annotation": "Align reads and count",
                            "tags": ["rna", "star"],
                            "steps": {
                                "0": {"type": "data_input"},
                                "1": {"type": "tool",
                                      "tool_id": "toolshed.g2.bx.psu.edu/repos/iuc/hisat2/hisat2/2.2.1"},
                                "2": {"type": "tool", "tool_id": "Cut1"},
                            }}},
            {"trsID": "#workflow/varcall", "categories": ["Variant Calling"],
             "readme": "Calls variants.",
             "definition": {"name": "Variant calling", "annotation": "Call variants from BAM",
                            "tags": ["dna"], "steps": {"0": {"type": "data_input"}}}},
        ]
    }
]


def search(query):
    galaxy_tools._iwc_cache.clear()
    galaxy_tools._iwc_cache["workflows"] = MANIFEST[0]["workflows"]
    try:
        return asyncio.run(galaxy_tools._search_iwc_workflows(FakeGalaxy(), {"query": query}))
    finally:
        galaxy_tools._iwc_cache.clear()


def test_matches_the_workflow_name():
    assert [e["name"] for e in search("rnaseq")] == ["RNAseq counts"]


def test_matches_the_description_and_tags():
    assert [e["name"] for e in search("call variants")] == ["Variant calling"]
    assert [e["name"] for e in search("star")] == ["RNAseq counts"]


def test_a_field_name_is_not_content():
    # Searching the entry's JSON matched its keys, so these returned every workflow.
    for field in ("name", "description", "tags", "categories", "trsID"):
        assert search(field) == []


def test_an_absent_term_matches_nothing():
    assert search("proteomics") == []


def test_the_readme_is_searched_as_the_description_promises():
    assert [e["name"] for e in search("per gene")] == ["RNAseq counts"]


def test_an_entry_carries_what_the_description_promises():
    entry = search("rnaseq")[0]
    assert entry["step_count"] == 3
    assert entry["tools_used"] == ["hisat2", "Cut1"]
    assert entry["authors"] == [{"name": "IWC", "orcid": "0000"}]
    assert entry["readme_summary"].startswith("# RNAseq")
