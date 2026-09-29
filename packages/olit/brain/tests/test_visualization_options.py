"""Where a parameter's options live, resolved rather than invented.

A parameter is named by the `path` get_visualization_details publishes, and a conditional's
branch is read from `config` in the shape save_visualization takes. Both are structural: a leaf
name cannot address heatmap's two axes, and no single case value can tell them apart.
"""

import asyncio

from olit.loop.visualizations import get_visualization_options

from .fakes import refused

IGV = {
    "name": "igv",
    "settings": [
        {
            "name": "source",
            "type": "conditional",
            "test_param": {
                "name": "origin",
                "type": "select",
                "data": [{"label": "IGV", "value": "igv"}, {"label": "Built in", "value": "builtin"}],
            },
            "cases": [
                {"value": "igv", "inputs": [{"name": "genome", "type": "data_json", "url": "https://x/g.json"}]},
                {"value": "builtin", "inputs": [{"name": "genome", "type": "data_table", "tables": ["fasta_indexes"]}]},
            ],
        },
        {"name": "locus", "type": "text"},
    ],
    "tracks": [{"name": "displayMode", "type": "select", "data": [{"label": "Expanded", "value": "EXPANDED"}]}],
}


# Two sibling conditionals declaring the same names, with the same case values in both.
def _axis(name):
    return {
        "name": name,
        "type": "conditional",
        "test_param": {"name": "type", "type": "select", "data": [{"label": "Date", "value": "d"}]},
        "cases": [
            {"value": "auto", "inputs": []},
            {
                "value": "d",
                "inputs": [{"name": "precision", "type": "select", "data": [{"label": "Day", "value": "day"}]}],
            },
            {"value": "f", "inputs": [{"name": "precision", "type": "integer"}]},
        ],
    }


HEATMAP = {"name": "heatmap", "settings": [_axis("x_axis_type"), _axis("y_axis_type")]}

# Nesting is part of the galaxy-charts contract, so a path has to carry identity at every level.
NESTED = {
    "name": "deep",
    "settings": [
        {
            "name": "outer",
            "type": "conditional",
            "test_param": {"name": "outer_mode", "type": "select", "data": [{"label": "A", "value": "a"}]},
            "cases": [
                {
                    "value": "a",
                    "inputs": [
                        {
                            "name": "middle",
                            "type": "conditional",
                            "test_param": {"name": "middle_mode", "type": "select", "data": []},
                            "cases": [
                                {
                                    "value": "m",
                                    "inputs": [
                                        {
                                            "name": "inner",
                                            "type": "conditional",
                                            "test_param": {"name": "inner_mode", "type": "select", "data": []},
                                            "cases": [
                                                {
                                                    "value": "p",
                                                    "inputs": [{"name": "leaf", "type": "data_table", "tables": ["p"]}],
                                                },
                                                {
                                                    "value": "q",
                                                    "inputs": [
                                                        {"name": "leaf", "type": "data_json", "url": "https://q"}
                                                    ],
                                                },
                                            ],
                                        }
                                    ],
                                },
                                {"value": "n", "inputs": [{"name": "leaf", "type": "data_json", "url": "https://n"}]},
                            ],
                        }
                    ],
                },
                {"value": "b", "inputs": [{"name": "middle", "type": "text"}]},
            ],
        }
    ],
}


class Galaxy:
    def __init__(self, plugin=None):
        self.plugin = plugin or IGV

    async def get(self, path, **kwargs):
        return self.plugin


class Charts:
    """galaxy-charts, as far as the policy around it is concerned."""

    def __init__(self, offered=None, message=None):
        self.offered = (
            offered
            if offered is not None
            else [
                {
                    "label": "Human hg19",
                    "value": {
                        "id": "hg19",
                        "columns": ["value", "name"],
                        "row": ["hg19", "Human hg19"],
                        "table": "fasta_indexes",
                    },
                }
            ]
        )
        self.message = message
        self.asked = []

    async def get_options(self, declared_input, context=None):
        self.asked.append((declared_input, context))
        if self.message:
            return {"success": False, "message": self.message}
        return {"success": True, "data": self.offered}


def call(charts=None, plugin=None, visualization="igv", **kw):
    return asyncio.run(
        get_visualization_options(Galaxy(plugin), charts or Charts(), {"visualization": visualization, **kw})
    )


def builtin(**kw):
    return {"settings": {"source": {"origin": "builtin"}}, **kw}


# --- igv: one path, three sources -------------------------------------------------------


def test_a_name_declared_in_several_cases_is_refused_rather_than_guessed():
    """igv declares `genome` per case with a different source each time."""
    out = refused(call(parameter="settings.source.genome"))
    assert "'settings.source' selects its inputs by 'origin'" in out
    assert "'igv'" in out and "'builtin'" in out, "the cases it could not choose between"


def test_the_refusal_names_each_case_as_the_form_names_it():
    """A live run read three bare tokens, picked the one it could satisfy, and used a phage
    genome for a human VCF. The labels are published; the refusal now carries them."""
    out = refused(call(parameter="settings.source.genome"))

    assert "'igv' (IGV)" in out
    assert "'builtin' (Built in)" in out


def test_the_refusal_shows_the_config_to_send_not_only_its_values():
    """A live run looped six times on this: naming the values does not say where they go."""
    out = refused(call(parameter="settings.source.genome"))
    assert 'config={"settings": {"source": {"origin": "<value>"}}}' in out


def test_a_path_is_named_once_however_many_cases_declare_it():
    """Each case of `source` declares `genome` at the same path, so the walk finds it three times."""
    out = refused(call(parameter="genome"))
    assert out.count("settings.source.genome") == 1, out


def test_the_config_selects_the_case_and_so_the_source():
    assert call(parameter="settings.source.genome", config=builtin())["source"] == "data_table"


def test_the_answer_names_the_canonical_path():
    assert call(parameter="settings.source.genome", config=builtin())["parameter"] == "settings.source.genome"


def test_a_path_that_is_not_rooted_at_a_group_is_refused():
    assert "is not a parameter path" in refused(call(parameter="source.genome", config=builtin()))


def test_every_listed_option_carries_the_value_to_store():
    """A select over objects hands back a dictionary; matching a label and filling the field is
    one call. A live session held only the id, and satisfied the refusal by wrapping it."""
    out = call(parameter="settings.source.genome", config=builtin())

    assert out["options"][0]["value"] == {
        "id": "hg19",
        "columns": ["value", "name"],
        "row": ["hg19", "Human hg19"],
        "table": "fasta_indexes",
    }


def test_a_select_over_scalars_lists_the_scalar_as_its_value():
    """The other kind: the option's value is the scalar itself, so id and value agree."""
    out = call(charts=Charts(offered=[{"label": "Expanded", "value": "EXPANDED"}]), parameter="tracks.displayMode")

    assert out["options"][0] == {"id": "EXPANDED", "name": "Expanded", "value": "EXPANDED"}


def test_an_option_carries_the_value_to_store_whole():
    match = call(parameter="settings.source.genome", config=builtin(), search="hg19")["matches"][0]
    assert match["id"] == "hg19"
    assert match["value"]["table"] == "fasta_indexes"
    assert match["value"]["row"] == ["hg19", "Human hg19"]


def test_the_resolver_is_asked_for_the_declared_input_it_found():
    charts = Charts()
    call(charts=charts, parameter="settings.source.genome", config=builtin())
    declared, context = charts.asked[0]
    assert declared["type"] == "data_table" and declared["tables"] == ["fasta_indexes"]
    assert "datasetId" in context


def test_the_other_cases_are_named_when_this_one_holds_nothing():
    out = call(charts=Charts(offered=[]), parameter="settings.source.genome", config=builtin())
    assert out["other_cases"] == ["igv"]


# --- a test parameter is a value too ----------------------------------------------------


def test_a_test_parameter_resolves_without_a_branch():
    """It selects the branch, so it cannot need one; heatmap's `type` was unreachable before."""
    out = call(charts=Charts(offered=[{"label": "Built in", "value": "builtin"}]), parameter="settings.source.origin")
    assert out["source"] == "declared"
    assert out["options"][0]["id"] == "builtin"


def test_a_test_parameter_holds_nothing_deeper():
    assert "holds nothing named" in refused(call(parameter="settings.source.origin.nope"))


# --- heatmap: sibling conditionals sharing names and case values ------------------------


def test_sibling_conditionals_are_told_apart_by_the_path():
    charts = Charts(offered=[{"label": "Day", "value": "day"}])
    for axis, kind in (("x_axis_type", "select"), ("y_axis_type", "select")):
        out = call(
            charts=charts,
            plugin=HEATMAP,
            visualization="heatmap",
            parameter=f"settings.{axis}.precision",
            config={"settings": {axis: {"type": "d"}}},
        )
        assert out["parameter"] == f"settings.{axis}.precision"
        assert out["source"] == "declared", kind


def test_the_same_case_value_in_both_siblings_stays_unambiguous():
    """`when` could not do this: both axes offer 'd', so only the path separates them."""
    charts = Charts(offered=[])
    config = {"settings": {"x_axis_type": {"type": "f"}, "y_axis_type": {"type": "d"}}}
    x = call(
        charts=charts,
        plugin=HEATMAP,
        visualization="heatmap",
        parameter="settings.x_axis_type.precision",
        config=config,
    )
    y = call(
        charts=charts,
        plugin=HEATMAP,
        visualization="heatmap",
        parameter="settings.y_axis_type.precision",
        config=config,
    )
    assert x["source"] == "integer" or x["source"] is not None
    assert charts.asked[-2][0]["type"] == "integer", "x chose case 'f'"
    assert charts.asked[-1][0]["type"] == "select", "y chose case 'd'"
    assert y["parameter"] == "settings.y_axis_type.precision"


def test_a_leaf_name_under_two_conditionals_is_refused_with_both_paths():
    out = refused(call(plugin=HEATMAP, visualization="heatmap", parameter="precision"))
    assert "is not a parameter path" in out
    assert "settings.x_axis_type.precision" in out and "settings.y_axis_type.precision" in out


# --- nesting ----------------------------------------------------------------------------


def test_a_nested_path_reads_a_branch_at_every_level():
    charts = Charts()
    out = call(
        charts=charts,
        plugin=NESTED,
        visualization="deep",
        parameter="settings.outer.middle.leaf",
        config={"settings": {"outer": {"outer_mode": "a", "middle": {"middle_mode": "n"}}}},
    )
    assert out["parameter"] == "settings.outer.middle.leaf"
    assert charts.asked[0][0]["type"] == "data_json", "the inner branch chose the json source"


def test_a_nested_path_missing_the_inner_branch_is_refused():
    out = refused(
        call(
            plugin=NESTED,
            visualization="deep",
            parameter="settings.outer.middle.leaf",
            config={"settings": {"outer": {"outer_mode": "a"}}},
        )
    )
    assert "'settings.outer.middle' selects its inputs by 'middle_mode'" in out
    assert "'m'" in out and "'n'" in out, "the cases it could not choose between"


def test_three_conditional_levels_resolve_by_the_same_recursion():
    """Depth is not a case the traversal knows about: each level reads its own selector."""
    charts = Charts()
    out = call(
        charts=charts,
        plugin=NESTED,
        visualization="deep",
        parameter="settings.outer.middle.inner.leaf",
        config={
            "settings": {"outer": {"outer_mode": "a", "middle": {"middle_mode": "m", "inner": {"inner_mode": "q"}}}}
        },
    )
    assert out["parameter"] == "settings.outer.middle.inner.leaf"
    assert charts.asked[0][0]["url"] == "https://q", "the innermost selector chose the source"


def test_the_innermost_missing_selector_is_the_one_named():
    """An outer level being satisfied must not make an inner omission look resolved."""
    out = refused(
        call(
            plugin=NESTED,
            visualization="deep",
            parameter="settings.outer.middle.inner.leaf",
            config={"settings": {"outer": {"outer_mode": "a", "middle": {"middle_mode": "m"}}}},
        )
    )
    assert "'settings.outer.middle.inner' selects its inputs by 'inner_mode'" in out
    assert "'p'" in out and "'q'" in out


def test_a_deep_test_parameter_is_reachable_too():
    out = call(
        charts=Charts(offered=[{"label": "Q", "value": "q"}]),
        plugin=NESTED,
        visualization="deep",
        parameter="settings.outer.middle.inner.inner_mode",
        config={"settings": {"outer": {"outer_mode": "a", "middle": {"middle_mode": "m"}}}},
    )
    assert out["parameter"] == "settings.outer.middle.inner.inner_mode"
    assert out["source"] == "declared"


def test_an_outer_branch_that_declares_a_plain_input_is_reachable():
    """Case 'b' declares `middle` as text, so the same name is a leaf down that branch."""
    charts = Charts(offered=[])
    out = call(
        charts=charts,
        plugin=NESTED,
        visualization="deep",
        parameter="settings.outer.middle",
        config={"settings": {"outer": {"outer_mode": "b"}}},
    )
    assert out["parameter"] == "settings.outer.middle"


# --- addressing ------------------------------------------------------------------------


def test_a_declared_select_in_tracks_is_offered_by_its_own_values():
    out = call(charts=Charts(offered=[{"label": "Expanded", "value": "EXPANDED"}]), parameter="tracks.displayMode")
    assert out["source"] == "declared"
    assert out["total"] == 1 and out["options"][0]["id"] == "EXPANDED"


def test_a_parameter_the_plugin_does_not_declare_is_refused():
    assert "is not a parameter path" in refused(call(parameter="nonsense"))


def test_a_path_naming_an_input_the_group_lacks_is_refused():
    assert "declares nothing named 'nonsense'" in refused(call(parameter="settings.nonsense"))


def test_a_plain_input_holds_nothing_deeper():
    assert "holds nothing named" in refused(call(parameter="settings.locus.inner"))


def test_a_conditional_named_alone_says_what_to_name_instead():
    out = refused(call(parameter="settings.source"))
    assert "is a conditional" in out and "origin" in out


def test_a_group_named_alone_is_refused():
    assert "is not a parameter path" in refused(call(parameter="settings"))


def test_a_failed_lookup_is_reported_rather_than_shown_as_no_options():
    out = refused(call(charts=Charts(message="no route to host"), parameter="settings.source.genome", config=builtin()))
    assert "Could not resolve" in out and "no route to host" in out


def test_browsing_says_how_to_get_the_value_to_store():
    assert "search" in call(parameter="settings.source.genome", config=builtin())["hint"]


# --- the case value both walkers read ---------------------------------------------------

BOOLEAN_CASE = {
    "name": "mode",
    "type": "conditional",
    "test_param": {"name": "advanced", "type": "boolean"},
    "cases": [
        {"value": "true", "inputs": [{"name": "depth", "type": "select", "data": [{"label": "Deep", "value": "d"}]}]},
        {"value": "false", "inputs": []},
    ],
}
BOOLEAN = {"name": "b", "settings": [BOOLEAN_CASE]}


def test_a_boolean_case_is_selected_by_either_representation():
    """The form stringifies a boolean to `"true"`, so a config may hold the string or the boolean."""
    for stored in ("true", True):
        out = call(
            charts=Charts(offered=[{"label": "Deep", "value": "d"}]),
            plugin=BOOLEAN,
            visualization="b",
            parameter="settings.mode.depth",
            config={"settings": {"mode": {"advanced": stored}}},
        )
        assert out["parameter"] == "settings.mode.depth", stored


TYPES = {"boolean": {"stores": {"type": "boolean"}}, "select": {"stores": {"type": "string"}}}


def test_the_save_validator_reads_a_case_value_the_same_way():
    """Two walkers over one representation: a case either walker finds, both must find."""
    from olit.loop.visualization_inputs import resolve_parameter
    from olit.loop.visualizations import _check_level

    entry = {"mode": {"advanced": True, "depth": "d"}}

    hit, problem = resolve_parameter(BOOLEAN, "settings.mode.depth", {"settings": entry})
    assert hit and not problem, problem
    assert _check_level(entry, [BOOLEAN_CASE], TYPES, "settings") is None


def test_a_test_parameter_is_validated_as_a_case_label():
    """It selects the case, so it holds a label; `"true"` is right even where boolean stores."""
    from olit.loop.visualizations import _check_level

    for stored in ("true", True, "false"):
        entry = {"mode": {"advanced": stored, **({"depth": "d"} if stored != "false" else {})}}
        assert _check_level(entry, [BOOLEAN_CASE], TYPES, "settings") is None, stored


def test_a_test_parameter_holding_no_declared_label_is_refused():
    from olit.loop.visualizations import _check_level

    bad = _check_level({"mode": {"advanced": "maybe"}}, [BOOLEAN_CASE], TYPES, "settings")
    assert bad and "selects the case" in bad["error"]
    assert "'true'" in bad["error"] and "'false'" in bad["error"]


def test_the_surface_dispatches_this_tool_to_the_module_that_defines_it():
    """The dispatcher special-cases this call, so moving the handler has to move the call with it.

    Nothing exercised that path when the handler moved modules, and the tool raised
    `module ... has no attribute 'get_visualization_options'` against a real Galaxy.
    """
    from olit.loop.tools import ToolSurface

    from .fakes import FakeSubstrate

    substrate = FakeSubstrate(galaxy=Galaxy(), charts=Charts(), capabilities=("llm", "local", "read"))
    out = asyncio.run(
        ToolSurface(substrate).dispatch(
            "get_visualization_options",
            {"visualization": "igv", "parameter": "settings.source.genome", "config": builtin()},
        )
    )

    assert not getattr(out, "is_error", False), out.content
    assert "hg19" in str(out.content)
