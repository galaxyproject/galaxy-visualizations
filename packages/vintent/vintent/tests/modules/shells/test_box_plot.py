import pytest
from vintent.modules.shells.box_plot import BoxPlotShell

def _profile(fields):
    return {"fields": fields}

def test_validate_ok_with_correct_types():
    shell = BoxPlotShell()
    params = {"x": "category", "y": "value"}
    profile = _profile(
        {
            "category": {"type": "nominal"},
            "value": {"type": "quantitative"},
        }
    )
    result = shell.validate(params, profile)
    assert result["ok"] is True
    assert result["errors"] == []

def test_validate_missing_required_encodings():
    shell = BoxPlotShell()
    profile = _profile(
        {
            "category": {"type": "nominal"},
            "value": {"type": "quantitative"},
        }
    )
    result = shell.validate({"x": "category"}, profile)
    assert result["ok"] is False
    assert result["errors"][0]["code"] == "missing_required_encoding"

def test_validate_unknown_field():
    shell = BoxPlotShell()
    params = {"x": "missing", "y": "value"}
    profile = _profile(
        {
            "value": {"type": "quantitative"},
        }
    )
    result = shell.validate(params, profile)
    assert result["ok"] is False
    assert result["errors"][0]["code"] == "unknown_field"

def test_validate_invalid_x_type():
    shell = BoxPlotShell()
    params = {"x": "value", "y": "other"}
    profile = _profile(
        {
            "value": {"type": "quantitative"},
            "other": {"type": "quantitative"},
        }
    )
    result = shell.validate(params, profile)
    assert result["ok"] is False
    err = result["errors"][0]
    assert err["code"] == "invalid_field_type"
    assert err["details"]["encoding"] == "x"

def test_validate_invalid_y_type():
    shell = BoxPlotShell()
    params = {"x": "category", "y": "group"}
    profile = _profile(
        {
            "category": {"type": "nominal"},
            "group": {"type": "nominal"},
        }
    )
    result = shell.validate(params, profile)
    assert result["ok"] is False
    err = result["errors"][0]
    assert err["code"] == "invalid_field_type"
    assert err["details"]["encoding"] == "y"

def test_compile_vega_lite_basic():
    shell = BoxPlotShell()
    params = {"x": "category", "y": "value"}
    values = [
        {"category": "A", "value": 1},
        {"category": "B", "value": 2},
    ]
    spec = shell.compile(params, values, renderer="vega-lite")
    assert spec["mark"]["type"] == "boxplot"
    assert spec["encoding"]["x"]["field"] == "category"
    assert spec["encoding"]["y"]["field"] == "value"
    assert spec["data"]["values"] == values

def test_compile_includes_optional_encodings():
    shell = BoxPlotShell()
    params = {
        "x": "category",
        "y": "value",
        "color": "group",
        "tooltip": "value",
    }
    values = [{"category": "A", "value": 1, "group": "g1"}]
    spec = shell.compile(params, values, renderer="vega-lite")
    assert "color" in spec["encoding"]
    assert "tooltip" in spec["encoding"]

def test_compile_non_vega_renderer_returns_empty():
    shell = BoxPlotShell()
    spec = shell.compile({}, [], renderer="svg")
    assert spec == {}
