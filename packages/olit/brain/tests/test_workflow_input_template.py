"""The workflow template is an execution contract: the legal values a run has to be built from.

olit hand-wrote this projection once and lost the option lists, the declared formats and the
.ga fallback with it. It now runs galaxy-mcp's own normalizer, so these cover what the agent
has to be able to see.
"""

import asyncio
import json

from olit.drivers.loop.galaxy_tools import _get_workflow_input_template

RUN_MODEL = {
    "name": "QC and trimming",
    "history_id": "h1",
    "has_upgrade_messages": False,
    "step_version_changes": ["using 1.3.3 instead of 1.3.5"],
    "steps": [
        {
            "step_index": 0,
            "step_type": "data_collection_input",
            "step_label": "Raw reads",
            "annotation": "paired-end",
            "inputs": [
                {
                    "name": "input",
                    "label": "Raw reads",
                    "optional": False,
                    "extensions": ["fastqsanger"],
                    "acceptable_extensions": [f"ext{i}" for i in range(793)],
                    "collection_type": "list:paired",
                    "type": "data_collection",
                }
            ],
        },
        {
            "step_index": 1,
            "step_type": "parameter_input",
            "step_label": "Strandedness",
            "annotation": "how the reads were sequenced",
            "inputs": [
                {
                    "name": "input",
                    "label": "Strandedness",
                    "optional": False,
                    "parameter_type": "text",
                    "value": "unstranded",
                    "options": [
                        ["forward", "forward", False],
                        ["reverse", "reverse", False],
                        ["unstranded", "unstranded", True],
                    ],
                }
            ],
        },
        {"step_index": 2, "step_type": "tool", "step_label": "fastp", "inputs": [{"cases": ["x" * 50000]}]},
    ],
}

GA_DEFINITION = {
    "steps": {
        "0": {"type": "data_input", "label": "reads", "tool_state": json.dumps({"format": ["fastqsanger"]})},
        "1": {
            "type": "parameter_input",
            "label": "Strandedness",
            "tool_state": json.dumps({"parameter_type": "text", "restrictions": ["forward", "reverse", "unstranded"]}),
        },
        "2": {"type": "tool", "label": "fastp", "tool_state": json.dumps({"opt": {"__class__": "RuntimeValue"}})},
    }
}

SHOW = {"name": "QC and trimming", "version": 3, "annotation": "a tiny workflow"}


def run(run_model=RUN_MODEL, definition=GA_DEFINITION, show=SHOW, args=None):
    """A Galaxy that answers the three reads the tool makes; run_model=None raises like a 400."""

    class G:
        async def get(self, path):
            if path.startswith("api/workflows/w1/download?"):
                if run_model is None:
                    raise RuntimeError("HTTP 400: History unavailable")
                return run_model
            if path == "api/workflows/w1/download":
                return definition
            return show

    return asyncio.run(_get_workflow_input_template(G(), args or {"workflow_id": "w1"}))


def test_a_multi_option_select_exposes_every_legal_value():
    """A default is not enough: the run needs one of several exact strings."""
    slot = [s for s in run()["slots"] if s["label"] == "Strandedness"][0]
    assert [o["value"] for o in slot["options"]] == ["forward", "reverse", "unstranded"]
    assert slot["option_count"] == 3


def test_a_template_is_returned_without_a_history_id():
    """style=run needs a history; the .ga export still carries the declared contract."""
    out = run(run_model=None)
    assert [s["label"] for s in out["slots"]] == ["reads", "Strandedness"]
    slot = out["slots"][1]
    assert [o["value"] for o in slot["options"]] == ["forward", "reverse", "unstranded"]
    assert out["guide"]["notes"], "the fallback has to say that options were not server-resolved"


def test_the_fallback_is_not_taken_when_style_run_answers():
    assert not run()["guide"].get("notes")


def test_the_declared_formats_are_kept_and_the_derived_list_is_not():
    """extensions is ['fastqsanger']; acceptable_extensions is 793 entries of compatibility."""
    slot = run()["slots"][0]
    assert slot["accepted_formats"] == ["fastqsanger"]
    assert "acceptable_extensions" not in slot


def test_the_tool_form_model_is_dropped():
    """The 50k of conditional cases on the tool step is what blew the context window."""
    assert "cases" not in json.dumps(run())


def test_the_template_is_ready_to_fill_and_keyed_by_step_index():
    out = run()
    assert out["inputs_template"] == {"0": {"src": "hdca", "id": "<collection_id>"}, "1": "<value>"}
    assert out["inputs_by"] == "step_index|step_uuid"


def test_a_legacy_runtime_value_is_flagged():
    """The pattern that makes a workflow fail through the API rather than the run form."""
    assert [w["kind"] for w in run()["warnings"]] == ["legacy_runtime_value"]


def test_version_warnings_survive_on_the_guide():
    """A missing or downgraded tool is the thing most likely to sink a run."""
    freshness = run()["guide"]["provenance"]["freshness"]
    assert freshness["has_upgrade_messages"] is False
    assert freshness["step_version_changes"] == ["using 1.3.3 instead of 1.3.5"]


def test_olit_keeps_the_annotation_and_the_default():
    slot = run()["slots"][1]
    assert slot["annotation"] == "how the reads were sequenced"
    assert slot["value"] == "unstranded"


def test_the_prompt_describes_the_contract_the_tool_returns():
    """The prompt names inputs_template and three placeholders; all three have to be real."""
    from olit.prompt import INVOKING_WORKFLOW

    out = run()
    assert "inputs_template" in INVOKING_WORKFLOW and "inputs_template" in out
    rendered = json.dumps(out["inputs_template"])
    assert all(p in INVOKING_WORKFLOW for p in ("<value>", "<dataset_id>", "<collection_id>"))
    assert "<collection_id>" in rendered and "<value>" in rendered
    assert out["inputs_by"] in INVOKING_WORKFLOW
