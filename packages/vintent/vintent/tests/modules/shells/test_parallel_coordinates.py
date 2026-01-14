import pytest
from vintent.modules.shells.parallel_coordinates import ParallelCoordinatesShell


def _profile(fields):
    return {"fields": fields}


class TestParallelCoordinatesValidate:
    def test_validate_ok_with_three_quantitative(self):
        shell = ParallelCoordinatesShell()
        params = {}
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
            "c": {"type": "quantitative"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is True
        assert result["errors"] == []

    def test_validate_not_enough_quantitative_fields(self):
        shell = ParallelCoordinatesShell()
        params = {}
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
            "c": {"type": "nominal"},
        })
        result = shell.validate(profile, params)
        assert result["ok"] is False
        assert result["errors"][0]["code"] == "not_enough_quantitative_fields"


class TestParallelCoordinatesIsApplicable:
    def test_applicable_with_three_quantitative(self):
        shell = ParallelCoordinatesShell()
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
            "c": {"type": "quantitative"},
        })
        assert shell.is_applicable(profile) is True

    def test_applicable_with_more_than_three_quantitative(self):
        shell = ParallelCoordinatesShell()
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
            "c": {"type": "quantitative"},
            "d": {"type": "quantitative"},
        })
        assert shell.is_applicable(profile) is True

    def test_not_applicable_with_only_two_quantitative(self):
        shell = ParallelCoordinatesShell()
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
        })
        assert shell.is_applicable(profile) is False


class TestParallelCoordinatesProcesses:
    def test_processes_returns_normalize_minmax(self):
        shell = ParallelCoordinatesShell()
        profile = _profile({
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
            "c": {"type": "quantitative"},
        })
        params = {}
        processes = shell.processes(profile, params)
        assert len(processes) == 1
        assert processes[0]["id"] == "normalize_minmax"


class TestParallelCoordinatesCompile:
    def test_compile_basic_parallel_coordinates(self):
        shell = ParallelCoordinatesShell()
        params = {"dimensions": ["a", "b", "c"]}
        values = [
            {"a": 1, "b": 2, "c": 3, "a_norm": 0.1, "b_norm": 0.2, "c_norm": 0.3},
            {"a": 4, "b": 5, "c": 6, "a_norm": 0.4, "b_norm": 0.5, "c_norm": 0.6},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["mark"]["type"] == "line"
        assert spec["mark"]["opacity"] == 0.5
        # Transform folds the normalized columns
        assert "transform" in spec
        assert spec["transform"][0]["fold"] == ["a_norm", "b_norm", "c_norm"]
        # Data should include row ids
        assert spec["data"]["values"][0]["_row_id"] == 0
        assert spec["data"]["values"][1]["_row_id"] == 1

    def test_compile_with_string_dimensions(self):
        shell = ParallelCoordinatesShell()
        params = {"dimensions": "single"}  # Single dimension as string
        values = [{"single": 1, "single_norm": 0.5}]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["transform"][0]["fold"] == ["single_norm"]

    def test_compile_infers_dimensions_from_data(self):
        shell = ParallelCoordinatesShell()
        params = {}  # No dimensions specified
        values = [
            {"x": 1, "y": 2, "z": 3, "x_norm": 0.1, "y_norm": 0.2, "z_norm": 0.3},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        # Should infer numeric fields (not _norm suffixed)
        fold_fields = spec["transform"][0]["fold"]
        assert "x_norm" in fold_fields
        assert "y_norm" in fold_fields
        assert "z_norm" in fold_fields

    def test_compile_with_color(self):
        shell = ParallelCoordinatesShell()
        params = {"dimensions": ["a", "b", "c"], "color": "group"}
        values = [
            {"a": 1, "b": 2, "c": 3, "a_norm": 0.1, "b_norm": 0.2, "c_norm": 0.3, "group": "X"},
        ]
        spec = shell.compile(params, values, renderer="vega-lite")
        assert spec["encoding"]["color"]["field"] == "group"

    def test_compile_non_vega_returns_empty(self):
        shell = ParallelCoordinatesShell()
        spec = shell.compile({}, [], renderer="svg")
        assert spec == {}
