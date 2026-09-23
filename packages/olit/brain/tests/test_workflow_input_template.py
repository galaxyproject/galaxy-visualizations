"""The workflow template is the input contract, not the run form the web client renders."""

import asyncio

from olit.drivers.loop.galaxy_tools import _get_workflow_input_template

RUN_MODEL = {
    "name": "QC and trimming",
    "history_id": "h1",
    "has_upgrade_messages": False,
    "step_version_changes": ["using 1.3.3 instead of 1.3.5"],
    "steps": [
        {"step_index": 0, "step_type": "data_collection_input", "step_label": "Raw reads",
         "step_name": "Input dataset collection", "annotation": "paired-end",
         "inputs": [{"name": "input", "label": "Raw reads", "optional": False,
                     "acceptable_extensions": [f"ext{i}" for i in range(793)],
                     "type": "data_collection", "value": None}]},
        {"step_index": 1, "step_type": "parameter_input", "step_label": "Quality",
         "step_name": "Input parameter", "annotation": None,
         "inputs": [{"name": "input", "label": "Quality", "optional": True, "type": "integer"}]},
        {"step_index": 2, "step_type": "tool", "step_label": "fastp",
         "inputs": [{"cases": ["x" * 50000]}]},
    ],
}


def run(model, args=None):
    class G:
        async def get(self, path):
            return model

    return asyncio.run(_get_workflow_input_template(G(), args or {"workflow_id": "w1"}))


def test_only_input_steps_survive():
    out = run(RUN_MODEL)
    assert [i["step_index"] for i in out["inputs"]] == [0, 1]
    assert all(i["type"] != "tool" for i in out["inputs"])


def test_the_tool_form_model_is_dropped():
    """The 50k of conditional cases on the tool step is what blew the context window."""
    import json

    assert "cases" not in json.dumps(run(RUN_MODEL))


def test_a_long_extension_list_becomes_a_count():
    ext = run(RUN_MODEL)["inputs"][0]["inputs"][0]["acceptable_extensions"]
    assert ext == {"count": 793, "note": "accepts most datatypes"}


def test_a_short_extension_list_is_kept_verbatim():
    model = {"name": "w", "steps": [
        {"step_index": 0, "step_type": "data_input", "step_label": "reads",
         "inputs": [{"name": "input", "acceptable_extensions": ["fastqsanger", "fastq"]}]}]}
    assert run(model)["inputs"][0]["inputs"][0]["acceptable_extensions"] == ["fastqsanger", "fastq"]


def test_version_warnings_are_kept():
    """A missing or downgraded tool is the thing most likely to sink a run."""
    out = run(RUN_MODEL)
    assert out["has_upgrade_messages"] is False
    assert out["step_version_changes"] == ["using 1.3.3 instead of 1.3.5"]


def test_the_result_names_how_inputs_are_keyed():
    assert run(RUN_MODEL)["inputs_by"] == "step_index"


def test_an_error_body_passes_through():
    """A missing tool comes back as an error dict; it must not be mistaken for a template."""
    assert run({"err_msg": "Following tools missing: falco"}) == {
        "err_msg": "Following tools missing: falco"
    }
