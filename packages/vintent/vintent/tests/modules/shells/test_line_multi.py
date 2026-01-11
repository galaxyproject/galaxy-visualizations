import pytest
from vintent.modules.shells.line_multi import LineMultiShell


def _profile(fields):
    return {"fields": fields}


class TestLineMultiValidate:
    def test_validate_ok_with_all_required_fields(self):
        shell = LineMultiShell()
        params = {"x": "date", "y": "value", "color": "series"}
        profile = _profile({
            "date": {"type": "temporal"},
            "value": {"type": "quantitative"},
            "series": {"type": "nominal"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is True
        assert result["errors"] == []

    def test_validate_missing_x(self):
        shell = LineMultiShell()
        params = {"y": "value", "color": "series"}
        profile = _profile({
            "value": {"type": "quantitative"},
            "series": {"type": "nominal"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_missing_y(self):
        shell = LineMultiShell()
        params = {"x": "date", "color": "series"}
        profile = _profile({
            "date": {"type": "temporal"},
            "series": {"type": "nominal"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_missing_color(self):
        shell = LineMultiShell()
        params = {"x": "date", "y": "value"}
        profile = _profile({
            "date": {"type": "temporal"},
            "value": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_unknown_y_field(self):
        shell = LineMultiShell()
        params = {"x": "date", "y": "missing", "color": "series"}
        profile = _profile({
            "date": {"type": "temporal"},
            "series": {"type": "nominal"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "unknown_field"

    def test_validate_y_wrong_type(self):
        shell = LineMultiShell()
        params = {"x": "date", "y": "category", "color": "series"}
        profile = _profile({
            "date": {"type": "temporal"},
            "category": {"type": "nominal"},
            "series": {"type": "nominal"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"
        assert result["errors"][0]["details"]["field"] == "category"

    def test_validate_color_wrong_type(self):
        shell = LineMultiShell()
        params = {"x": "date", "y": "value", "color": "amount"}
        profile = _profile({
            "date": {"type": "temporal"},
            "value": {"type": "quantitative"},
            "amount": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"
        assert result["errors"][0]["details"]["field"] == "amount"


class TestLineMultiIsApplicable:
    def test_applicable_with_nominal_and_quantitative(self):
        shell = LineMultiShell()
        profile = _profile({
            "date": {"type": "temporal"},
            "category": {"type": "nominal"},
            "value": {"type": "quantitative"},
        })
        assert shell.is_applicable(profile) is True

    def test_not_applicable_without_nominal(self):
        shell = LineMultiShell()
        profile = _profile({
            "date": {"type": "temporal"},
            "value": {"type": "quantitative"},
            "other": {"type": "quantitative"},
        })
        assert shell.is_applicable(profile) is False

    def test_not_applicable_without_quantitative(self):
        shell = LineMultiShell()
        profile = _profile({
            "date": {"type": "temporal"},
            "category": {"type": "nominal"},
            "other": {"type": "nominal"},
        })
        assert shell.is_applicable(profile) is False


class TestLineMultiCompile:
    def test_compile_basic_multi_line(self):
        shell = LineMultiShell()
        params = {"x": "date", "y": "value", "color": "series"}
        values = [
            {"date": "2024-01-01", "value": 10, "series": "A"},
            {"date": "2024-01-01", "value": 20, "series": "B"},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["mark"]["type"] == "line"
        assert spec["mark"]["point"] is True
        assert spec["encoding"]["x"]["field"] == "date"
        assert spec["encoding"]["y"]["field"] == "value"
        assert spec["encoding"]["color"]["field"] == "series"

    def test_compile_with_numeric_x_infers_quantitative(self):
        shell = LineMultiShell()
        params = {"x": "index", "y": "value", "color": "series"}
        values = [{"index": 0, "value": 10, "series": "A"}]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["encoding"]["x"]["type"] == "quantitative"

    def test_compile_with_stroke_dash(self):
        shell = LineMultiShell()
        params = {"x": "date", "y": "value", "color": "series", "strokeDash": "type"}
        values = [{"date": "2024-01-01", "value": 10, "series": "A", "type": "solid"}]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["encoding"]["strokeDash"]["field"] == "type"

    def test_compile_non_vega_returns_empty(self):
        shell = LineMultiShell()
        spec = shell.compile({}, [], renderer="svg")
        assert spec == {}
