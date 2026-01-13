import pytest
from vintent.modules.shells.treemap import TreemapShell


def _profile(fields):
    return {"fields": fields}


class TestTreemapValidate:
    def test_validate_ok_with_nominal_category(self):
        shell = TreemapShell()
        params = {"category": "type"}
        profile = _profile({"type": {"type": "nominal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is True
        assert result["errors"] == []

    def test_validate_missing_category(self):
        shell = TreemapShell()
        profile = _profile({"type": {"type": "nominal"}})
        result = shell.validate(profile, {})
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_category_not_in_fields(self):
        shell = TreemapShell()
        params = {"category": "missing"}
        profile = _profile({"type": {"type": "nominal"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "missing_required_encoding"

    def test_validate_category_wrong_type(self):
        shell = TreemapShell()
        params = {"category": "amount"}
        profile = _profile({"amount": {"type": "quantitative"}})
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "invalid_field_type"


class TestTreemapIsApplicable:
    def test_applicable_with_nominal_field(self):
        shell = TreemapShell()
        profile = _profile({"category": {"type": "nominal"}})
        assert shell.is_applicable(profile) is True

    def test_not_applicable_without_nominal(self):
        shell = TreemapShell()
        profile = _profile({"value": {"type": "quantitative"}})
        assert shell.is_applicable(profile) is False


class TestTreemapProcesses:
    def test_processes_returns_group_aggregate(self):
        shell = TreemapShell()
        profile = _profile({"category": {"type": "nominal"}})
        params = {"category": "category"}
        processes = shell.processes(profile, params)
        assert len(processes) == 1
        assert processes[0]["id"] == "group_aggregate"
        assert processes[0]["params"]["group_by"] == "category"
        assert processes[0]["params"]["op"] == "count"

    def test_processes_with_custom_op_and_value(self):
        shell = TreemapShell()
        profile = _profile({
            "category": {"type": "nominal"},
            "amount": {"type": "quantitative"},
        })
        params = {"category": "category", "value": "amount", "op": "sum"}
        processes = shell.processes(profile, params)
        assert processes[0]["params"]["op"] == "sum"
        assert processes[0]["params"]["metric"] == "amount"


class TestTreemapCompile:
    def test_compile_basic_treemap(self):
        shell = TreemapShell()
        params = {"category": "type"}
        values = [
            {"type": "A", "count": 10},
            {"type": "B", "count": 20},
            {"type": "C", "count": 15},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["mark"]["type"] == "rect"
        assert spec["mark"]["stroke"] == "white"
        assert spec["encoding"]["color"]["field"] == "type"
        # Uses x, x2, y, y2 for squarify layout
        assert "x" in spec["encoding"]
        assert "x2" in spec["encoding"]
        assert "y" in spec["encoding"]
        assert "y2" in spec["encoding"]
        # Data should have layout positions
        assert len(spec["data"]["values"]) == 3
        assert "x" in spec["data"]["values"][0]
        assert "y" in spec["data"]["values"][0]

    def test_compile_with_value_field(self):
        shell = TreemapShell()
        params = {"category": "type", "value": "amount", "op": "sum"}
        values = [{"type": "A", "amount": 100}]
        spec = shell.compile(params, values, renderer="vega-lite")
        # Tooltip should reference the value field
        tooltip_fields = [t["field"] for t in spec["encoding"]["tooltip"]]
        assert "amount" in tooltip_fields

    def test_compile_has_tooltip(self):
        shell = TreemapShell()
        params = {"category": "type"}
        values = [{"type": "A", "count": 10}]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert "tooltip" in spec["encoding"]
        tooltip_fields = [t["field"] for t in spec["encoding"]["tooltip"]]
        assert "type" in tooltip_fields
        assert "count" in tooltip_fields

    def test_compile_non_vega_returns_empty(self):
        shell = TreemapShell()
        spec = shell.compile({}, [], renderer="svg")
        assert spec == {}

    def test_compile_layout_fills_area(self):
        """Verify squarify layout fills the available area with normalized coordinates."""
        shell = TreemapShell()
        params = {"category": "type"}
        values = [
            {"type": "A", "count": 50},
            {"type": "B", "count": 30},
            {"type": "C", "count": 20},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        layout = spec["data"]["values"]
        # All rects should have valid normalized positions (0-1 range)
        for item in layout:
            assert item["x"] >= 0
            assert item["y"] >= 0
            assert item["x2"] <= 1
            assert item["y2"] <= 1
            assert item["x2"] > item["x"]
            assert item["y2"] > item["y"]
        # Should use container sizing for responsiveness
        assert spec["width"] == "container"
        assert spec["height"] == "container"
