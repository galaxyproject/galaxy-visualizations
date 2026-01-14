import pytest
from vintent.modules.shells.diverging_bar import DivergingBarShell


def _profile(fields):
    return {"fields": fields}


class TestDivergingBarValidate:
    def test_validate_ok_with_nominal_and_quantitative(self):
        shell = DivergingBarShell()
        params = {"category": "name", "value": "change"}
        profile = _profile({
            "name": {"type": "nominal"},
            "change": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is True
        assert result["errors"] == []

    def test_validate_missing_category(self):
        shell = DivergingBarShell()
        params = {"value": "change"}
        profile = _profile({"change": {"type": "quantitative"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_missing_value(self):
        shell = DivergingBarShell()
        params = {"category": "name"}
        profile = _profile({"name": {"type": "nominal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_unknown_category(self):
        shell = DivergingBarShell()
        params = {"category": "missing", "value": "change"}
        profile = _profile({"change": {"type": "quantitative"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "unknown_field"

    def test_validate_unknown_value(self):
        shell = DivergingBarShell()
        params = {"category": "name", "value": "missing"}
        profile = _profile({"name": {"type": "nominal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "unknown_field"

    def test_validate_category_wrong_type(self):
        shell = DivergingBarShell()
        params = {"category": "value", "value": "change"}
        profile = _profile({
            "value": {"type": "quantitative"},
            "change": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"
        assert result["errors"][0]["details"]["field"] == "value"

    def test_validate_value_wrong_type(self):
        shell = DivergingBarShell()
        params = {"category": "name", "value": "type"}
        profile = _profile({
            "name": {"type": "nominal"},
            "type": {"type": "nominal"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"
        assert result["errors"][0]["details"]["field"] == "type"


class TestDivergingBarIsApplicable:
    def test_applicable_with_nominal_and_quantitative(self):
        shell = DivergingBarShell()
        profile = _profile({
            "category": {"type": "nominal"},
            "value": {"type": "quantitative"},
        })
        assert shell.is_applicable(profile) is True

    def test_not_applicable_without_nominal(self):
        shell = DivergingBarShell()
        profile = _profile({"value": {"type": "quantitative"}})
        assert shell.is_applicable(profile) is False

    def test_not_applicable_without_quantitative(self):
        shell = DivergingBarShell()
        profile = _profile({"category": {"type": "nominal"}})
        assert shell.is_applicable(profile) is False


class TestDivergingBarCompile:
    def test_compile_basic_diverging_bar(self):
        shell = DivergingBarShell()
        params = {"category": "name", "value": "change"}
        values = [
            {"name": "A", "change": 10},
            {"name": "B", "change": -5},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["mark"] == "bar"
        assert spec["encoding"]["y"]["field"] == "name"
        assert spec["encoding"]["x"]["field"] == "change"
        assert spec["data"]["values"] == values

    def test_compile_colors_positive_negative_by_default(self):
        shell = DivergingBarShell()
        params = {"category": "name", "value": "change"}
        values = [{"name": "A", "change": 10}]
        spec = shell.compile(params, values, renderer="vega-lite")
        # Check that color is conditional based on positive/negative
        assert "condition" in spec["encoding"]["color"]
        assert "datum['change'] >= 0" in spec["encoding"]["color"]["condition"]["test"]

    def test_compile_with_explicit_color_field(self):
        shell = DivergingBarShell()
        params = {"category": "name", "value": "change", "color": "group"}
        values = [{"name": "A", "change": 10, "group": "X"}]
        spec = shell.compile(params, values, renderer="vega-lite")
        # When color field specified, use that instead of conditional
        assert spec["encoding"]["color"]["field"] == "group"

    def test_compile_non_vega_returns_empty(self):
        shell = DivergingBarShell()
        spec = shell.compile({}, [], renderer="svg")
        assert spec == {}
