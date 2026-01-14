import pytest
from vintent.modules.shells.pie_chart import PieChartShell


def _profile(fields):
    return {"fields": fields}


class TestPieChartValidate:
    def test_validate_ok_with_nominal_category(self):
        shell = PieChartShell()
        params = {"category": "type"}
        profile = _profile({"type": {"type": "nominal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is True
        assert result["errors"] == []

    def test_validate_missing_category(self):
        shell = PieChartShell()
        profile = _profile({"type": {"type": "nominal"}})
        result = shell.validate(profile, {})
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_category_not_in_fields(self):
        shell = PieChartShell()
        params = {"category": "missing"}
        profile = _profile({"type": {"type": "nominal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_category_wrong_type(self):
        shell = PieChartShell()
        params = {"category": "amount"}
        profile = _profile({"amount": {"type": "quantitative"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"


class TestPieChartIsApplicable:
    def test_applicable_with_nominal_field(self):
        shell = PieChartShell()
        profile = _profile({"category": {"type": "nominal"}})
        assert shell.is_applicable(profile) is True

    def test_not_applicable_without_nominal(self):
        shell = PieChartShell()
        profile = _profile({"value": {"type": "quantitative"}})
        assert shell.is_applicable(profile) is False


class TestPieChartProcesses:
    def test_processes_returns_group_aggregate(self):
        shell = PieChartShell()
        profile = _profile({"category": {"type": "nominal"}})
        params = {"category": "category"}
        processes = shell.processes(profile, params)
        assert len(processes) == 1
        assert processes[0]["id"] == "group_aggregate"
        assert processes[0]["params"]["group_by"] == "category"
        assert processes[0]["params"]["op"] == "count"

    def test_processes_with_custom_op_and_value(self):
        shell = PieChartShell()
        profile = _profile({
            "category": {"type": "nominal"},
            "amount": {"type": "quantitative"},
        })
        params = {"category": "category", "value": "amount", "op": "sum"}
        processes = shell.processes(profile, params)
        assert processes[0]["params"]["op"] == "sum"
        assert processes[0]["params"]["metric"] == "amount"


class TestPieChartCompile:
    def test_compile_basic_pie(self):
        shell = PieChartShell()
        params = {"category": "type"}
        values = [
            {"type": "A", "count": 10},
            {"type": "B", "count": 20},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["mark"]["type"] == "arc"
        assert spec["encoding"]["color"]["field"] == "type"
        assert spec["encoding"]["theta"]["field"] == "count"
        assert spec["data"]["values"] == values

    def test_compile_with_value_field(self):
        shell = PieChartShell()
        params = {"category": "type", "value": "amount", "op": "sum"}
        values = [{"type": "A", "amount": 100}]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["encoding"]["theta"]["field"] == "amount"

    def test_compile_non_vega_returns_empty(self):
        shell = PieChartShell()
        spec = shell.compile({}, [], renderer="svg")
        assert spec == {}
