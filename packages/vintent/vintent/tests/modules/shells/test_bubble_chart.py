import pytest
from vintent.modules.shells.bubble_chart import BubbleChartShell


def _profile(fields):
    return {"fields": fields}


class TestBubbleChartValidate:
    def test_validate_ok_with_three_quantitative_fields(self):
        shell = BubbleChartShell()
        params = {"x": "a", "y": "b", "size": "c"}
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
            "c": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is True
        assert result["errors"] == []

    def test_validate_missing_x(self):
        shell = BubbleChartShell()
        params = {"y": "b", "size": "c"}
        profile = _profile({
            "b": {"type": "quantitative"},
            "c": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_missing_y(self):
        shell = BubbleChartShell()
        params = {"x": "a", "size": "c"}
        profile = _profile({
            "a": {"type": "quantitative"},
            "c": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_missing_size(self):
        shell = BubbleChartShell()
        params = {"x": "a", "y": "b"}
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_unknown_field(self):
        shell = BubbleChartShell()
        params = {"x": "a", "y": "b", "size": "missing"}
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "unknown_field"
        assert result["errors"][0]["details"]["field"] == "missing"

    def test_validate_wrong_field_type(self):
        shell = BubbleChartShell()
        params = {"x": "a", "y": "b", "size": "c"}
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
            "c": {"type": "nominal"},  # Wrong type
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"
        assert result["errors"][0]["details"]["field"] == "c"


class TestBubbleChartIsApplicable:
    def test_applicable_with_three_quantitative(self):
        shell = BubbleChartShell()
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
            "c": {"type": "quantitative"},
        })
        assert shell.is_applicable(profile) is True

    def test_not_applicable_with_only_two_quantitative(self):
        shell = BubbleChartShell()
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
            "c": {"type": "nominal"},
        })
        assert shell.is_applicable(profile) is False


class TestBubbleChartCompile:
    def test_compile_basic_bubble(self):
        shell = BubbleChartShell()
        params = {"x": "a", "y": "b", "size": "c"}
        values = [
            {"a": 1, "b": 2, "c": 10},
            {"a": 3, "b": 4, "c": 20},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["mark"]["type"] == "circle"
        assert spec["mark"]["opacity"] == 0.7
        assert spec["encoding"]["x"]["field"] == "a"
        assert spec["encoding"]["y"]["field"] == "b"
        assert spec["encoding"]["size"]["field"] == "c"
        assert spec["data"]["values"] == values

    def test_compile_with_color(self):
        shell = BubbleChartShell()
        params = {"x": "a", "y": "b", "size": "c", "color": "group"}
        values = [{"a": 1, "b": 2, "c": 10, "group": "X"}]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["encoding"]["color"]["field"] == "group"

    def test_compile_with_tooltip(self):
        shell = BubbleChartShell()
        params = {"x": "a", "y": "b", "size": "c", "tooltip": "name"}
        values = [{"a": 1, "b": 2, "c": 10, "name": "Item"}]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["encoding"]["tooltip"]["field"] == "name"

    def test_compile_non_vega_returns_empty(self):
        shell = BubbleChartShell()
        spec = shell.compile({}, [], renderer="svg")
        assert spec == {}
