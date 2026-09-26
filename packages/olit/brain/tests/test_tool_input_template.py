"""The skeleton the description promises, built the way galaxy-mcp builds it."""

from olit.drivers.loop.tool_inputs import build_input_template

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
