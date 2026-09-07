"""Every process is advertised as a tool, and its schema comes from its yml inputs."""

import asyncio
import json

from olite.drivers.loop.tools import ToolSurface, _process_tool_schemas
from olite.registry import ProcessRegistry


class FakeManifest:
    def allows(self, capability):
        return True


class FakeSubstrate:
    manifest = FakeManifest()

    def scoped(self, capabilities):
        return self


def _schemas():
    return {s["function"]["name"]: s["function"] for s in _process_tool_schemas(_processes())}


def _processes():
    return ProcessRegistry().load_packaged()


def _surface():
    return ToolSurface(FakeSubstrate(), _processes())


def test_every_registered_process_is_advertised_exactly_once():
    names = [t["function"]["name"] for t in _surface().schemas()]
    for process in _processes().names():
        assert names.count(process) == 1, f"{process} advertised {names.count(process)} times"


def test_the_generic_runner_is_gone():
    assert "run_process" not in [t["function"]["name"] for t in _surface().schemas()]


def test_vintent_requires_both_of_its_inputs():
    fn = _schemas()["vintent_dataset"]
    assert sorted(fn["parameters"]["required"]) == ["dataset_id", "request"]
    assert set(fn["parameters"]["properties"]) == {"dataset_id", "request"}


def test_lineage_keeps_its_optional_numbers_optional():
    fn = _schemas()["lineage_report"]
    params = fn["parameters"]
    assert params["required"] == ["dataset_id"]
    assert params["properties"]["depth"]["type"] == "integer"
    assert params["properties"]["max_per_level"]["type"] == "integer"


def test_an_array_input_becomes_an_array_of_strings():
    params = _schemas()["organize_datasets"]["parameters"]
    assert params["properties"]["tags"] == {"type": "array", "items": {"type": "string"}}


def test_a_default_is_shown_to_the_model():
    props = _schemas()["organize_datasets"]["parameters"]["properties"]
    assert "auto" in props["structure"]["description"]


def test_the_description_carries_when_to_use():
    for name, fn in _schemas().items():
        process = _processes().get(name)
        assert process.description in fn["description"]
        if process.when_to_use:
            assert process.when_to_use in fn["description"]


def test_a_missing_required_input_is_refused_before_the_graph_runs():
    outcome = asyncio.run(_surface().dispatch("vintent_dataset", {"dataset_id": "d1"}))
    assert outcome.is_error and "request" in outcome.text


def test_an_unknown_name_is_still_unknown():
    outcome = asyncio.run(_surface().dispatch("organise_datasets", {}))
    assert outcome.is_error and "Unknown tool" in outcome.text
