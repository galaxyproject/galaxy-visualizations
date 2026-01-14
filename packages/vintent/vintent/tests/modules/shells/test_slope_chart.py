import pytest
from vintent.modules.shells.slope_chart import SlopeChartShell


def _profile(fields):
    return {"fields": fields}


class TestSlopeChartValidate:
    def test_validate_ok_with_all_required_fields(self):
        shell = SlopeChartShell()
        params = {"category": "name", "period": "year", "value": "amount"}
        profile = _profile({
            "name": {"type": "nominal"},
            "year": {"type": "nominal"},
            "amount": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is True
        assert result["errors"] == []

    def test_validate_missing_category(self):
        shell = SlopeChartShell()
        params = {"period": "year", "value": "amount"}
        profile = _profile({
            "year": {"type": "nominal"},
            "amount": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_missing_period(self):
        shell = SlopeChartShell()
        params = {"category": "name", "value": "amount"}
        profile = _profile({
            "name": {"type": "nominal"},
            "amount": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_missing_value(self):
        shell = SlopeChartShell()
        params = {"category": "name", "period": "year"}
        profile = _profile({
            "name": {"type": "nominal"},
            "year": {"type": "nominal"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_unknown_field(self):
        shell = SlopeChartShell()
        params = {"category": "missing", "period": "year", "value": "amount"}
        profile = _profile({
            "year": {"type": "nominal"},
            "amount": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "unknown_field"
        assert result["errors"][0]["details"]["field"] == "missing"

    def test_validate_category_wrong_type(self):
        shell = SlopeChartShell()
        params = {"category": "amount", "period": "year", "value": "other"}
        profile = _profile({
            "amount": {"type": "quantitative"},
            "year": {"type": "nominal"},
            "other": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"
        assert result["errors"][0]["details"]["field"] == "amount"

    def test_validate_period_wrong_type(self):
        shell = SlopeChartShell()
        params = {"category": "name", "period": "amount", "value": "other"}
        profile = _profile({
            "name": {"type": "nominal"},
            "amount": {"type": "quantitative"},
            "other": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"
        assert result["errors"][0]["details"]["field"] == "amount"

    def test_validate_value_wrong_type(self):
        shell = SlopeChartShell()
        params = {"category": "name", "period": "year", "value": "type"}
        profile = _profile({
            "name": {"type": "nominal"},
            "year": {"type": "nominal"},
            "type": {"type": "nominal"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"
        assert result["errors"][0]["details"]["field"] == "type"


class TestSlopeChartIsApplicable:
    def test_applicable_with_two_nominal_and_quantitative(self):
        shell = SlopeChartShell()
        profile = _profile({
            "category": {"type": "nominal"},
            "period": {"type": "nominal"},
            "value": {"type": "quantitative"},
        })
        assert shell.is_applicable(profile) is True

    def test_not_applicable_with_only_one_nominal(self):
        shell = SlopeChartShell()
        profile = _profile({
            "category": {"type": "nominal"},
            "value": {"type": "quantitative"},
        })
        assert shell.is_applicable(profile) is False

    def test_not_applicable_without_quantitative(self):
        shell = SlopeChartShell()
        profile = _profile({
            "category": {"type": "nominal"},
            "period": {"type": "nominal"},
        })
        assert shell.is_applicable(profile) is False


class TestSlopeChartCompile:
    def test_compile_basic_slope_chart(self):
        shell = SlopeChartShell()
        params = {"category": "name", "period": "year", "value": "amount"}
        values = [
            {"name": "A", "year": "2023", "amount": 100},
            {"name": "A", "year": "2024", "amount": 150},
            {"name": "B", "year": "2023", "amount": 80},
            {"name": "B", "year": "2024", "amount": 60},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert "layer" in spec
        assert len(spec["layer"]) == 3
        # Line layer
        assert spec["layer"][0]["mark"]["type"] == "line"
        # Circle layer
        assert spec["layer"][1]["mark"]["type"] == "circle"
        # Text layer
        assert spec["layer"][2]["mark"]["type"] == "text"
        # Encoding
        assert spec["encoding"]["x"]["field"] == "year"
        assert spec["encoding"]["y"]["field"] == "amount"
        assert spec["encoding"]["color"]["field"] == "name"

    def test_compile_non_vega_returns_empty(self):
        shell = SlopeChartShell()
        spec = shell.compile({}, [], renderer="svg")
        assert spec == {}
