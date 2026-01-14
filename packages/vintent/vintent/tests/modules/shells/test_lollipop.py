import pytest
from vintent.modules.shells.lollipop import LollipopShell


def _profile(fields):
    return {"fields": fields}


class TestLollipopValidate:
    def test_validate_ok_with_count_op(self):
        shell = LollipopShell()
        params = {"category": "type", "op": "count"}
        profile = _profile({"type": {"type": "nominal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is True
        assert result["errors"] == []

    def test_validate_ok_with_sum_op_and_value(self):
        shell = LollipopShell()
        params = {"category": "type", "op": "sum", "value": "amount"}
        profile = _profile({
            "type": {"type": "nominal"},
            "amount": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is True
        assert result["errors"] == []

    def test_validate_missing_category(self):
        shell = LollipopShell()
        params = {"op": "count"}
        profile = _profile({"type": {"type": "nominal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_category_not_in_fields(self):
        shell = LollipopShell()
        params = {"category": "missing", "op": "count"}
        profile = _profile({"type": {"type": "nominal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_category_wrong_type(self):
        shell = LollipopShell()
        params = {"category": "amount", "op": "count"}
        profile = _profile({"amount": {"type": "quantitative"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"

    def test_validate_non_count_op_requires_value(self):
        shell = LollipopShell()
        params = {"category": "type", "op": "sum"}  # Missing value
        profile = _profile({"type": {"type": "nominal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_value_wrong_type(self):
        shell = LollipopShell()
        params = {"category": "type", "op": "sum", "value": "other"}
        profile = _profile({
            "type": {"type": "nominal"},
            "other": {"type": "nominal"},  # Should be quantitative
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"


class TestLollipopIsApplicable:
    def test_applicable_with_nominal_and_quantitative(self):
        shell = LollipopShell()
        profile = _profile({
            "category": {"type": "nominal"},
            "value": {"type": "quantitative"},
        })
        assert shell.is_applicable(profile) is True

    def test_not_applicable_without_nominal(self):
        shell = LollipopShell()
        profile = _profile({"value": {"type": "quantitative"}})
        assert shell.is_applicable(profile) is False

    def test_not_applicable_without_quantitative(self):
        shell = LollipopShell()
        profile = _profile({"category": {"type": "nominal"}})
        assert shell.is_applicable(profile) is False


class TestLollipopProcesses:
    def test_processes_returns_group_aggregate(self):
        shell = LollipopShell()
        profile = _profile({
            "category": {"type": "nominal"},
            "value": {"type": "quantitative"},
        })
        params = {"category": "category", "op": "sum", "value": "value"}
        processes = shell.processes(profile, params)
        assert len(processes) == 1
        assert processes[0]["id"] == "group_aggregate"
        assert processes[0]["params"]["group_by"] == "category"
        assert processes[0]["params"]["op"] == "sum"
        assert processes[0]["params"]["metric"] == "value"


class TestLollipopCompile:
    def test_compile_basic_lollipop(self):
        shell = LollipopShell()
        params = {"category": "type", "op": "sum", "value": "amount"}
        values = [
            {"type": "A", "amount": 100},
            {"type": "B", "amount": 200},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert "layer" in spec
        assert len(spec["layer"]) == 2
        # First layer is the rule (stem)
        assert spec["layer"][0]["mark"]["type"] == "rule"
        # Second layer is the circle (dot)
        assert spec["layer"][1]["mark"]["type"] == "circle"
        assert spec["encoding"]["x"]["field"] == "type"
        assert spec["encoding"]["y"]["field"] == "amount"

    def test_compile_with_count_op_uses_count_field(self):
        shell = LollipopShell()
        params = {"category": "type", "op": "count"}
        values = [{"type": "A", "count": 10}]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["encoding"]["y"]["field"] == "count"

    def test_compile_non_vega_returns_empty(self):
        shell = LollipopShell()
        spec = shell.compile({}, [], renderer="svg")
        assert spec == {}
