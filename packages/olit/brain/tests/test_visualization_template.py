"""A plugin's config template: the shape to fill, as a Galaxy tool already gets one."""

from olit.drivers.loop.visualization_inputs import build_visualization_template, template_cases

TYPES = {
    "text": {"stores": {"type": "string"}},
    "boolean": {"stores": {"type": "boolean"}},
    "integer": {"stores": {"type": "integer"}},
    "data_column": {"stores": {"type": "string"}},
    "select": {"stores": {"type": "string"}, "options": {"kind": "declared", "from": "options"}},
    "data": {"stores": {"type": "object", "required": ["id"]}},
    "data_json": {"stores": {"type": "object", "required": ["id"]}},
    "conditional": {"stores": {"type": "object"}},
}

PLOTLY = {
    "settings": [{"name": "stack_bar", "type": "boolean"}, {"name": "x_axis_label", "type": "text"}],
    "tracks": [
        {
            "name": "type",
            "type": "select",
            "options": [{"label": "Bar", "value": "bar"}, {"label": "Lines", "value": "lines"}],
        },
        {"name": "x", "type": "data_column"},
    ],
}

IGV = {
    "settings": [
        {"name": "locus", "type": "text"},
        {
            "name": "source",
            "type": "conditional",
            "test_param": {"name": "origin", "type": "select"},
            "cases": [
                {"value": "builtin", "inputs": [{"name": "genome", "type": "data"}]},
                {"value": "igv", "inputs": [{"name": "genome", "type": "data_json"}]},
            ],
        },
    ],
    "tracks": [{"name": "urlDataset", "type": "data"}],
}


def test_a_scalar_input_gets_a_bare_placeholder_not_an_entry():
    """The agent stored {'value': 'scatter'} for a select and {'column': ...} for a column."""
    template = build_visualization_template(PLOTLY, TYPES)
    track = template["tracks"][0]
    assert track["type"] == "bar"  # the first declared choice, not an object
    assert track["x"] == "<value>"  # data_column stores a string
    assert template["settings"] == {"stack_bar": False, "x_axis_label": "<value>"}


def test_an_entry_valued_input_is_marked_as_one():
    template = build_visualization_template(IGV, TYPES)
    assert template["tracks"][0]["urlDataset"] == {"<from get_visualization_options>": True}


def test_a_conditional_nests_its_case_rather_than_flattening_it():
    """galaxy-charts stores the test parameter and the case's inputs inside one object."""
    settings = build_visualization_template(IGV, TYPES)["settings"]
    assert settings["source"]["origin"] == "builtin"
    assert settings["source"]["genome"] == {"<from get_visualization_options>": True}
    assert "source.origin" not in settings and "origin" not in settings


def test_the_other_cases_are_named_so_the_first_is_not_the_only_one_seen():
    assert template_cases(IGV) == {"source": ["builtin", "igv"]}
    assert template_cases(PLOTLY) == {}


def test_a_plugin_with_no_tracks_gets_no_tracks_key():
    assert "tracks" not in build_visualization_template({"settings": []}, TYPES)
