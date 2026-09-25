"""Galaxy accepts a datatype its converters cannot bridge, so the mismatch has to stop here.

Fed a json dataset into a slot declaring tabular, a real Galaxy schedules the run, reports the
invocation `completed` and lands an `ok` dataset whose only evidence is a misc_info line. That is
the shape an agent narrates as success, and the one galaxy-mcp's preflight exists to catch.
"""

import asyncio
import json

from olit.drivers.loop import galaxy_tools
from olit.drivers.loop.galaxy_tools import _invoke_workflow

RUN_MODEL = {
    "name": "filter",
    "steps": [
        {
            "step_index": 0,
            "step_type": "data_input",
            "step_label": "table",
            "inputs": [
                {
                    "name": "input",
                    "optional": False,
                    "extensions": ["tabular"],
                    "acceptable_extensions": ["tabular", "csv", "fasta"],
                }
            ],
        },
        {
            "step_index": 1,
            "step_type": "parameter_input",
            "step_label": "threshold",
            "inputs": [{"name": "input", "optional": False, "parameter_type": "integer"}],
        },
    ],
}

# fasta converts to tabular, json does not; both are real Galaxy datatypes.
MAPPING = {
    "datatypes_mapping": {
        "ext_to_class_name": {"tabular": "Tabular", "csv": "Csv", "fasta": "Fasta", "json": "Json"},
        "class_to_classes": {
            "Tabular": {"Tabular": True},
            "Csv": {"Csv": True},
            "Fasta": {"Fasta": True},
            "Json": {"Json": True},
        },
    }
}


class Galaxy:
    """Answers the reads the preflight makes and records whether the invocation was sent."""

    def __init__(self, extensions=None, fail=None, root="test"):
        self._root = root
        self.extensions = extensions or {}
        self.fail = fail or ()
        self.posted = None
        self.gets = []

    async def get(self, path):
        self.gets.append(path)
        if any(marker in path for marker in self.fail):
            raise RuntimeError(f"boom: {path}")
        if path.startswith("api/workflows/w1/download?"):
            return RUN_MODEL
        if path.startswith("api/datatypes/"):
            return MAPPING
        if path.startswith("api/datasets/"):
            return {"extension": self.extensions.get(path.rsplit("/", 1)[-1])}
        if path.startswith("api/dataset_collections/"):
            return {"collection_type": "list", "elements": []}
        return {}

    async def post(self, path, body):
        self.posted = (path, body)
        return {"id": "inv1", "state": "new"}


def invoke(galaxy, inputs=None, **extra):
    galaxy_tools._DATATYPES_CACHE.clear()
    args = {"workflow_id": "w1", "history_id": "h1", **extra}
    if inputs is not None:
        args["inputs"] = inputs
    return asyncio.run(_invoke_workflow(galaxy, args))


def test_a_provable_datatype_mismatch_never_reaches_galaxy():
    """The live case: Galaxy takes json into a tabular slot and lands an ok, empty dataset."""
    g = Galaxy(extensions={"d1": "json"})
    out = invoke(g, {"0": {"src": "hda", "id": "d1"}})
    assert g.posted is None, "the invocation was submitted anyway"
    assert out.is_error
    assert "Dataset datatype 'json' is not accepted here" in out.content


def test_a_converter_compatible_datatype_still_runs():
    """fasta is in Galaxy's own acceptable_extensions, so refusing it would be stricter than Galaxy."""
    g = Galaxy(extensions={"d1": "fasta"})
    invoke(g, {"0": {"src": "hda", "id": "d1"}})
    assert g.posted is not None


def test_the_rejection_carries_the_slots_to_retry_with():
    g = Galaxy(extensions={"d1": "json"})
    out = invoke(g, {"0": {"src": "hda", "id": "d1"}})
    body = out.content.split("Expected input slots", 1)[1]
    assert [s["label"] for s in json.loads(body[body.index("[") :])] == ["table", "threshold"]


def test_a_scalar_in_a_data_slot_is_stopped():
    """Galaxy answers this with an unreadable pydantic tagged-union dump."""
    g = Galaxy()
    out = invoke(g, {"0": "not-a-reference"})
    assert g.posted is None
    assert "expects a {'src','id'} reference" in out.content


def test_a_collection_in_a_dataset_slot_is_stopped():
    """Galaxy answers 'collection not found', which blames the id rather than the src."""
    g = Galaxy()
    out = invoke(g, {"0": {"src": "hdca", "id": "c1"}})
    assert g.posted is None
    assert "got a collection (hdca)" in out.content


def test_a_parameter_slot_given_a_dataset_is_stopped():
    g = Galaxy(extensions={"d1": "tabular"})
    out = invoke(g, {"0": {"src": "hda", "id": "d1"}, "1": {"src": "hda", "id": "d1"}})
    assert g.posted is None
    assert "expected a scalar value" in out.content


def test_nothing_is_preflighted_when_no_inputs_are_supplied():
    """Upstream preflights only `if inputs`; a parameterless run must not pay for it."""
    g = Galaxy()
    invoke(g, None)
    assert g.gets == []
    assert g.posted is not None


def test_a_valid_invocation_is_submitted_unchanged():
    """Olit's request shaping is the contract; the preflight must not touch it."""
    g = Galaxy(extensions={"d1": "tabular"})
    invoke(g, {"0": {"src": "hda", "id": "d1"}, "1": 5}, history_name="ignored")
    path, body = g.posted
    assert path == "api/workflows/w1/invocations"
    assert body == {"inputs": {"0": {"src": "hda", "id": "d1"}, "1": 5}, "inputs_by": "step_index", "history_id": "h1"}


def test_preflight_machinery_failure_never_blocks_a_run():
    """Slot resolution, the datatype lookup and enrichment are advisory, not a dependency."""
    for broken in ("api/workflows/w1/download", "api/datatypes/", "api/datasets/"):
        g = Galaxy(extensions={"d1": "json"}, fail=(broken,))
        invoke(g, {"0": {"src": "hda", "id": "d1"}})
        assert g.posted is not None, f"failing {broken} stopped an otherwise valid run"


def test_a_rejection_is_a_correctable_error_not_a_guard_refusal():
    """It is the agent's argument to fix, like a missing required parameter; not a policy refusal."""
    out = invoke(Galaxy(extensions={"d1": "json"}), {"0": {"src": "hda", "id": "d1"}})
    assert out.is_error and not out.refused and out.guard is None
