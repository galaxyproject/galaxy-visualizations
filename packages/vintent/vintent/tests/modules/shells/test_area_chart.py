import pytest
from vintent.modules.shells.area_chart import AreaChartShell


def _profile(fields):
    return {"fields": fields}


class TestAreaChartValidate:
    def test_validate_ok_with_temporal_and_quantitative(self):
        shell = AreaChartShell()
        params = {"x": "date", "y": "value"}
        profile = _profile({
            "date": {"type": "temporal"},
            "value": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is True
        assert result["errors"] == []

    def test_validate_ok_with_quantitative_x(self):
        shell = AreaChartShell()
        params = {"x": "index", "y": "value"}
        profile = _profile({
            "index": {"type": "quantitative"},
            "value": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is True

    def test_validate_missing_x(self):
        shell = AreaChartShell()
        params = {"y": "value"}
        profile = _profile({"value": {"type": "quantitative"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_missing_y(self):
        shell = AreaChartShell()
        params = {"x": "date"}
        profile = _profile({"date": {"type": "temporal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_unknown_y_field(self):
        shell = AreaChartShell()
        params = {"x": "date", "y": "missing"}
        profile = _profile({"date": {"type": "temporal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "unknown_field"

    def test_validate_y_wrong_type(self):
        shell = AreaChartShell()
        params = {"x": "date", "y": "category"}
        profile = _profile({
            "date": {"type": "temporal"},
            "category": {"type": "nominal"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"


class TestAreaChartCompile:
    def test_compile_with_temporal_x(self):
        shell = AreaChartShell()
        params = {"x": "date", "y": "value"}
        values = [
            {"date": "2024-01-01", "value": 10},
            {"date": "2024-01-02", "value": 20},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["mark"]["type"] == "area"
        assert spec["mark"]["line"] is True
        assert spec["encoding"]["x"]["field"] == "date"
        assert spec["encoding"]["x"]["type"] == "temporal"
        assert spec["encoding"]["y"]["field"] == "value"
        assert spec["data"]["values"] == values

    def test_compile_with_numeric_x_infers_quantitative(self):
        shell = AreaChartShell()
        params = {"x": "index", "y": "value"}
        values = [
            {"index": 0, "value": 10},
            {"index": 1, "value": 20},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["encoding"]["x"]["type"] == "quantitative"

    def test_compile_with_color(self):
        shell = AreaChartShell()
        params = {"x": "date", "y": "value", "color": "series"}
        values = [{"date": "2024-01-01", "value": 10, "series": "A"}]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["encoding"]["color"]["field"] == "series"

    def test_compile_non_vega_returns_empty(self):
        shell = AreaChartShell()
        spec = shell.compile({}, [], renderer="svg")
        assert spec == {}
