import pytest
from vintent.modules.shells.scatter import ScatterShell

def _profile(fields):
    return {"fields": fields}

def test_validate_ok_with_two_quantitative_fields():
    shell = ScatterShell()
    params = {"x": "a", "y": "b"}
    profile = _profile(
        {
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
        }
    )
    result = shell.validate(params, profile)
    assert result["ok"] is True
    assert result["errors"] == []

def test_validate_missing_required_encodings():
    shell = ScatterShell()
    profile = _profile(
        {
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
        }
    )
    result = shell.validate({"x": "a"}, profile)
    assert result["ok"] is False
    assert result["errors"][0]["code"] == "missing_required_encoding"

def test_validate_unknown_field():
    shell = ScatterShell()
    params = {"x": "a", "y": "c"}
    profile = _profile(
        {
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
        }
    )
    result = shell.validate(params, profile)
    assert result["ok"] is False
    assert result["errors"][0]["code"] == "unknown_field"

def test_validate_invalid_field_types():
    shell = ScatterShell()
    params = {"x": "a", "y": "b"}
    profile = _profile(
        {
            "a": {"type": "nominal"},
            "b": {"type": "quantitative"},
        }
    )
    result = shell.validate(params, profile)
    assert result["ok"] is False
    err = result["errors"][0]
    assert err["code"] == "invalid_field_type"
    assert err["details"]["actual"]["x"] == "nominal"
    assert err["details"]["actual"]["y"] == "quantitative"

def test_compile_basic_scatter():
    shell = ScatterShell()
    params = {"x": "a", "y": "b"}
    values = [
        {"a": 1, "b": 2},
        {"a": 2, "b": 3},
    ]
    spec = shell.compile(params, values, renderer="vega-lite")
    assert spec["mark"]["type"] == "point"
    assert spec["encoding"]["x"]["field"] == "a"
    assert spec["encoding"]["y"]["field"] == "b"
    assert spec["data"]["values"] == values

def test_compile_includes_optional_encodings():
    shell = ScatterShell()
    params = {
        "x": "a",
        "y": "b",
        "color": "group",
        "tooltip": "a",
    }
    values = [{"a": 1, "b": 2, "group": "g1"}]
    spec = shell.compile(params, values, renderer="vega-lite")
    assert "color" in spec["encoding"]
    assert "tooltip" in spec["encoding"]

def test_compile_non_vega_renderer_returns_empty():
    shell = ScatterShell()
    spec = shell.compile({}, [], renderer="svg")
    assert spec == {}
