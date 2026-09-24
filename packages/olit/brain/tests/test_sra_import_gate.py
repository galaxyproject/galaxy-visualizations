"""SRA fan-out is batched before Galaxy sees it; loom's sibling-call gate, ported."""

import asyncio

import pytest

from olit.drivers.loop import sra_import_gate
from olit.drivers.loop.tools import ToolSurface
from .fakes import FakeSubstrate

TOOL = "toolshed.g2.bx.psu.edu/repos/iuc/sra_tools/fasterq_dump/3.1.1+galaxy1"


def call(call_id, accession, **overrides):
    args = {
        "history_id": "history-1",
        "tool_id": TOOL,
        "inputs": {
            "input|input_select": "accession_number",
            "input|accession": accession,
            "adv|seq_defline": "@$ac.$si/$ri",
            "adv|minlen": 0,
            "adv|split": "--split-3",
            "adv|skip_technical": True,
        },
    }
    args.update(overrides)
    return {"id": call_id, "function": {"name": "run_tool", "arguments": args}}


class Gate:
    """A turn: a reply's calls are observed, then each is checked before it runs."""

    def __init__(self):
        self.gate = sra_import_gate.SraImportGate()

    def assistant(self, calls):
        self.gate.observe(calls)

    def check(self, c):
        return self.gate.check(c["id"], c["function"]["name"], c["function"]["arguments"])


@pytest.fixture
def g():
    return Gate()


def test_blocks_same_settings_singletons_before_any_of_them_runs(g):
    calls = [call(f"c{i}", f"SRR{17449121 - i}") for i in range(7)]
    g.assistant(calls)
    reasons = [g.check(c) for c in calls]
    assert all(reasons)
    assert "SRR17449121,SRR17449120,SRR17449119,SRR17449118,SRR17449117,SRR17449116,SRR17449115" in reasons[0]

    # The model corrects it itself, with no approval and no uploaded manifest.
    batch = call("batch", ",".join(c["function"]["arguments"]["inputs"]["input|accession"] for c in calls))
    g.assistant([batch])
    assert g.check(batch) is None


def test_corrected_subset_passes_and_releases_the_batch(g):
    g.assistant([call("a", "SRR1"), call("b", "SRR2"), call("c", "SRR3")])
    corrected = call("remaining", "SRR2,SRR3")
    g.assistant([corrected])
    assert g.check(corrected) is None
    later = call("later", "SRR2")
    g.assistant([later])
    assert g.check(later) is None


def test_unrelated_later_accessions_are_not_forced_into_a_rejected_batch(g):
    g.assistant([call("a", "SRR1"), call("b", "SRR2")])
    unrelated = call("unrelated", "ERR10")
    g.assistant([unrelated])
    assert g.check(unrelated) is None


def test_a_rejected_batch_cannot_be_serialized_across_replies(g):
    g.assistant([call("a", "SRR1"), call("b", "SRR2"), call("c", "SRR3")])
    assert g.check(call("a", "SRR1"))
    # Indistinguishable from "a preflight found the others already imported".
    first = call("first", "SRR1")
    g.assistant([first])
    assert g.check(first) is None
    second = call("second", "SRR2")
    g.assistant([second])
    assert '"SRR2,SRR3"' in g.check(second)


def test_the_one_accession_a_preflight_left_missing_passes(g):
    g.assistant([call("a", "SRR1"), call("b", "SRR2")])
    missing = call("missing", "SRR2")
    g.assistant([missing])
    assert g.check(missing) is None


def test_a_submitted_batch_may_be_split_to_recover_from_its_failure(g):
    batch = call("batch", "SRR1,SRR2")
    g.assistant([batch])
    assert g.check(batch) is None
    split = [call("a", "SRR1"), call("b", "SRR2")]
    g.assistant(split)
    assert [g.check(c) for c in split] == [None, None]


def test_a_genuine_single_accession_passes(g):
    single = call("only", "SRR1")
    g.assistant([single])
    assert g.check(single) is None


def test_a_batch_does_not_outlive_its_turn():
    # One gate per ToolSurface, and one surface per turn: loom clears on agent_end.
    first = Gate()
    first.assistant([call("a", "SRR1"), call("b", "SRR2")])
    assert Gate().check(call("next", "SRR1")) is None


@pytest.mark.parametrize("difference", ["history", "settings", "version", "storage"])
def test_imports_with_a_different_destination_or_settings_stay_separate(g, difference):
    a, b = call("a", "SRR1"), call("b", "SRR2")
    args = b["function"]["arguments"]
    if difference == "history":
        args["history_id"] = "history-2"
    if difference == "settings":
        args["inputs"]["adv|minlen"] = 100
    if difference == "version":
        args["tool_id"] = TOOL.replace("3.1.1", "3.0.0")
    if difference == "storage":
        args["preferred_object_store_id"] = "archive"
    g.assistant([a, b])
    assert g.check(a) is None
    assert g.check(b) is None


def test_nested_and_flat_input_encodings_are_the_same_settings(g):
    a = call("a", "SRR1")
    b = call(
        "b",
        "SRR2",
        inputs={
            "input": {"input_select": "accession_number", "accession": "SRR2", "__current_case__": 0},
            "adv": {"seq_defline": "@$ac.$si/$ri", "minlen": 0, "split": "--split-3", "skip_technical": True},
        },
    )
    g.assistant([a, b])
    assert g.check(a)
    assert g.check(b)


@pytest.mark.parametrize("tool_id", ["fastq_dump", "fasterq_dump"])
def test_bare_wrapper_ids_are_recognized(g, tool_id):
    calls = [call("a", "ERR1", tool_id=tool_id), call("b", "DRR2", tool_id=tool_id)]
    g.assistant(calls)
    assert all(g.check(c) for c in calls)


def test_a_prefixed_tool_name_is_the_same_tool(g):
    calls = [call("a", "SRR1"), call("b", "SRR2")]
    for c in calls:
        c["function"]["name"] = "galaxy_run_tool"
    g.assistant(calls)
    assert all(g.check(c) for c in calls)


def test_one_list_file_hda_corrects_a_rejected_batch(g):
    g.assistant([call("a", "SRR1"), call("b", "SRR2")])
    corrected = call("file", "unused")
    inputs = corrected["function"]["arguments"]["inputs"]
    del inputs["input|accession"]
    inputs["input|input_select"] = "file_list"
    inputs["input|file_list"] = {"src": "hda", "id": "manifest-1"}
    g.assistant([corrected])
    assert g.check(corrected) is None


@pytest.mark.parametrize(
    "value",
    [
        {"__class__": "Batch", "values": ["SRR1", "SRR2"]},
        {"batch": True, "values": ["SRR1", "SRR2"]},
        {"src": "hdca", "id": "mapped-manifests"},
    ],
)
def test_galaxy_mapping_is_refused(g, value):
    mapped = call("mapped", "unused", inputs={"input|input_select": "file_list", "input|file_list": value})
    g.assistant([mapped])
    assert g.check(mapped)


def test_duplicate_accessions_are_refused_in_one_call_and_across_siblings(g):
    duplicate = call("duplicate", "SRR1,SRR1")
    g.assistant([duplicate])
    assert g.check(duplicate)
    siblings = [call("a", "SRR1"), call("b", "SRR1")]
    g.assistant(siblings)
    assert all(g.check(c) for c in siblings)
    corrected = call("deduplicated", "SRR1")
    g.assistant([corrected])
    assert g.check(corrected) is None


def test_other_tools_custom_wrappers_and_malformed_inputs_are_left_alone(g):
    custom = TOOL.replace("/iuc/", "/custom/")
    calls = [
        call("a", "SRR1", tool_id="fastp"),
        call("b", "SRR2", tool_id="fastp"),
        call("c", "SRR1", tool_id=custom),
        call("d", "SRR2", tool_id=custom),
        call(
            "e", "SRR1", inputs={"input|input_select": "sra_file", "input|sra_file": {"src": "hdca", "id": "archives"}}
        ),
        call("f", "SRR1", inputs="not JSON"),
    ]
    g.assistant(calls)
    assert [g.check(c) for c in calls] == [None] * len(calls)


class RecordingGalaxy:
    def __init__(self):
        self.posts = []

    async def get(self, path):
        return {}

    async def post(self, path, body=None):
        self.posts.append((path, body))
        return {"id": "job-1"}


def test_the_dispatcher_refuses_a_fan_out_without_reaching_galaxy():
    substrate = FakeSubstrate(galaxy=RecordingGalaxy(), capabilities=("llm", "local", "read", "write"))
    surface = ToolSurface(substrate)
    calls = [call("a", "SRR1"), call("b", "SRR2")]
    surface.observe(calls)
    for c in calls:
        outcome = asyncio.run(surface.dispatch("run_tool", c["function"]["arguments"], c["id"]))
        assert outcome.is_error and outcome.refused
        assert "Batch SRA imports" in outcome.text or "batch SRA imports" in outcome.text
    assert substrate.galaxy.posts == []

    corrected = call("batch", "SRR1,SRR2")
    surface.observe([corrected])
    outcome = asyncio.run(surface.dispatch("run_tool", corrected["function"]["arguments"], "batch"))
    assert not outcome.is_error
    assert len(substrate.galaxy.posts) == 1
