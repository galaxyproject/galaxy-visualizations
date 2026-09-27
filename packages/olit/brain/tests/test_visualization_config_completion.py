"""A saved config carries the declared inputs the caller left out.

Olit read the galaxy-charts registry to describe a plugin's surface and to reject an undeclared
parameter, and never used it to complete what came back. So a saved config held only the inputs
the model happened to send, which is not what the Charts form writes, and a plugin that requires
a declared input to be addressable rendered nothing. Measured on a live instance: 21 of 46
plotly-family visualizations were blank because no track carried `label`.

The plugin's own declaration supplies a default where it has one; the registry supplies it for a
type whose default is a property of the type rather than of the plugin.
"""

import asyncio
import json

from olit.drivers.loop import galaxy_tools
from olit.drivers.loop.galaxy_tools import _save_visualization, complete_config

# What `api/plugins/plotly` reports, verbatim.
PLOTLY = {
    "name": "plotly",
    "settings": [
        {"name": "stack_bar", "type": "boolean", "value": "false"},
        {"name": "stack_lines", "type": "boolean", "value": "false"},
        {"name": "x_axis_label", "type": "text", "value": "X-axis"},
        {"name": "y_axis_label", "type": "text", "value": "Y-axis"},
    ],
    "tracks": [
        {"name": "color", "type": "color"},
        {"name": "type", "type": "select", "value": "bar"},
        {"name": "name", "type": "text", "value": "Track label"},
        {"name": "label", "type": "data_column", "is_auto": "true"},
        {"name": "x", "type": "data_column", "is_auto": "true"},
        {"name": "y", "type": "data_column", "is_number": "true"},
    ],
}

# The saved track behind blank chart 77e82dae0361ed66.
BLANK_CHART_TRACK = {"name": "Buried", "type": "lines", "x": "0", "y": "5"}


def test_a_declared_default_fills_an_omitted_input():
    out = complete_config(PLOTLY, {"tracks": [{"x": "0", "y": "5"}]})

    assert out["tracks"][0] == {"x": "0", "y": "5", "type": "bar", "name": "Track label"}


def test_a_default_is_stored_as_the_type_says_it_is():
    """The declaration spells every default as a string; `stores` says what it becomes."""
    out = complete_config(PLOTLY, {"settings": {}})

    assert out["settings"] == {
        "stack_bar": False,
        "stack_lines": False,
        "x_axis_label": "X-axis",
        "y_axis_label": "Y-axis",
    }


def test_what_the_caller_sent_is_never_overwritten():
    sent = {"tracks": [BLANK_CHART_TRACK], "settings": {"x_axis_label": "Aminoacid"}}

    out = complete_config(PLOTLY, sent)

    assert out["tracks"][0]["name"] == "Buried"
    assert out["tracks"][0]["type"] == "lines"
    assert out["settings"]["x_axis_label"] == "Aminoacid"


def test_an_input_with_no_declared_default_is_left_out():
    """`color`, `label`, `x` and `y` declare no value, and the registry at this version declares
    none for their types, so there is nothing to fill and nothing is invented."""
    out = complete_config(PLOTLY, {"tracks": [BLANK_CHART_TRACK]})

    assert out["tracks"][0] == BLANK_CHART_TRACK


def test_a_type_that_declares_its_own_default_supplies_it(monkeypatch):
    """The registry's own fallback, which is where a default belonging to a type belongs.

    galaxy-charts declares `data_column` under `is_auto` as storing "auto"; `inputTypeRegistry()`
    carries it. This is the half that makes the blank charts render, and it arrives by vendoring a
    registry that has it rather than by naming the type here.
    """
    registry = json.loads(json.dumps(galaxy_tools.vendor.galaxy_charts_inputs()))
    registry["types"]["data_column"]["fallback"] = {"value": "auto", "requires": "is_auto"}
    monkeypatch.setattr(galaxy_tools.vendor, "galaxy_charts_inputs", lambda: registry)

    out = complete_config(PLOTLY, {"tracks": [BLANK_CHART_TRACK]})

    # label and x declare is_auto; y does not, and picking a column for it needs the dataset.
    assert out["tracks"][0]["label"] == "auto"
    assert out["tracks"][0]["x"] == "0"
    assert "y" in out["tracks"][0] and out["tracks"][0]["y"] == "5"
    assert "color" not in out["tracks"][0]


def test_a_fallback_is_skipped_when_the_input_does_not_declare_its_flag(monkeypatch):
    registry = json.loads(json.dumps(galaxy_tools.vendor.galaxy_charts_inputs()))
    registry["types"]["data_column"]["fallback"] = {"value": "auto", "requires": "is_auto"}
    monkeypatch.setattr(galaxy_tools.vendor, "galaxy_charts_inputs", lambda: registry)

    out = complete_config(PLOTLY, {"tracks": [{}]})

    assert out["tracks"][0] == {"type": "bar", "name": "Track label", "label": "auto", "x": "auto"}


CONDITIONAL = {
    "name": "conditioned",
    "tracks": [
        {
            "name": "mode",
            "type": "conditional",
            "test_param": {"name": "kind", "type": "select", "value": "simple"},
            "cases": [
                {"value": "simple", "inputs": [{"name": "size", "type": "integer", "value": "4"}]},
                {"value": "complex", "inputs": [{"name": "depth", "type": "integer", "value": "9"}]},
            ],
        }
    ],
}


def test_a_conditional_is_completed_through_its_chosen_case():
    out = complete_config(CONDITIONAL, {"tracks": [{}]})

    assert out["tracks"][0] == {"mode": {"kind": "simple", "size": 4}}


def test_a_conditional_the_caller_steered_completes_that_case_only():
    out = complete_config(CONDITIONAL, {"tracks": [{"mode": {"kind": "complex"}}]})

    assert out["tracks"][0] == {"mode": {"kind": "complex", "depth": 9}}


def test_nothing_is_added_when_the_caller_sent_no_settings_or_tracks():
    """Completion fills what a caller asked for; it does not invent a track."""
    out = complete_config(PLOTLY, {"dataset_id": "d1"})

    assert out == {"dataset_id": "d1"}


class _Galaxy:
    def __init__(self):
        self.posted = None

    async def get(self, path, **kwargs):
        if path.startswith("api/datasets/"):
            return {"extension": "tabular", "name": "aminos.tabular"}
        if path.startswith("api/plugins?"):
            return [{"name": "plotly"}]
        if path == "api/plugins/plotly":
            return PLOTLY
        if path == "api/plugins":
            return [{"name": "plotly"}]
        return []

    async def post(self, path, body):
        self.posted = (path, body)
        return {"id": "v1"}


def test_the_config_galaxy_is_given_is_the_completed_one():
    galaxy = _Galaxy()

    asyncio.run(
        _save_visualization(
            galaxy,
            {"visualization": "plotly", "dataset_id": "d1", "tracks": [{"x": "0", "y": "5"}]},
        )
    )

    _, body = galaxy.posted
    assert body["config"]["tracks"] == [{"x": "0", "y": "5", "type": "bar", "name": "Track label"}]


def test_a_refused_config_is_not_completed_and_not_saved():
    galaxy = _Galaxy()

    out = asyncio.run(
        _save_visualization(
            galaxy,
            {"visualization": "plotly", "dataset_id": "d1", "tracks": [{"nonsense": "1"}]},
        )
    )

    assert galaxy.posted is None
    assert "nonsense" in json.dumps(getattr(out, "content", out))
