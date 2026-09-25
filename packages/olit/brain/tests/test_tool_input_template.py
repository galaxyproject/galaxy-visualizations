"""The skeleton the description promises, built the way galaxy-mcp builds it."""

from olit.drivers.loop.tool_inputs import build_input_template, summarize_tool_inputs

CAT1 = {
    "inputs": [
        {"name": "input1", "type": "data", "optional": False},
        {
            "name": "queries",
            "type": "repeat",
            "optional": False,
            "inputs": [{"name": "input2", "type": "data", "optional": False}],
        },
    ]
}
COND = {
    "inputs": [
        {
            "name": "adv",
            "type": "conditional",
            "test_param": {
                "name": "mode",
                "type": "select",
                "options": [["Simple", "simple", True], ["Full", "full", False]],
            },
            "cases": [
                {"value": "simple", "inputs": [{"name": "n", "type": "integer"}]},
                {"value": "full", "inputs": [{"name": "x", "type": "float"}]},
            ],
        },
    ]
}


def test_a_repeat_appears_as_a_fillable_first_instance():
    """The failure this guards: an agent submitted queries=[] and concatenated one file."""
    template = build_input_template(CAT1)
    assert template["queries_0|input2"] == {"src": "hda", "id": "<dataset_id>"}
    assert template["input1"] == {"src": "hda", "id": "<dataset_id>"}


def test_a_conditional_shows_its_selector_and_first_branch():
    template = build_input_template(COND)
    assert template["adv|mode"] == "simple"
    assert template["adv|n"] == 0
    assert "adv|x" not in template


def test_the_summary_keeps_the_nesting_flattened_keys_need():
    summary = summarize_tool_inputs(CAT1)
    repeat = next(p for p in summary if p["type"] == "repeat")
    assert repeat["repeat_key_hint"] == "queries_0|<param>"
    assert [c["name"] for c in repeat["children"]] == ["input2"]


def test_a_select_offers_its_choices():
    summary = summarize_tool_inputs(COND)
    assert summary[0]["selector"]["choices"] == ["simple", "full"]
    assert summary[0]["selector"]["key_hint"] == "adv|mode"
