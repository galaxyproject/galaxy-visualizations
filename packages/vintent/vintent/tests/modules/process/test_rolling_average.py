import pytest
from vintent.modules.process.analyze.rolling_average import run, log


def test_run_empty_rows_returns_empty():
    assert run([], {"field": "x"}) == []


def test_run_returns_rows_if_no_field():
    rows = [{"x": 1}, {"x": 2}]
    result = run(rows, {})
    assert result == rows


def test_run_computes_rolling_average():
    rows = [{"x": 10}, {"x": 20}, {"x": 30}, {"x": 40}]
    result = run(rows, {"field": "x", "window": 3})

    # First row: avg of [10] = 10
    assert result[0]["x_rolling_avg"] == 10.0
    # Second row: avg of [10, 20] = 15
    assert result[1]["x_rolling_avg"] == 15.0
    # Third row: avg of [10, 20, 30] = 20
    assert result[2]["x_rolling_avg"] == 20.0
    # Fourth row: avg of [20, 30, 40] = 30
    assert result[3]["x_rolling_avg"] == 30.0


def test_run_preserves_original_values():
    rows = [{"x": 10, "y": "a"}, {"x": 20, "y": "b"}]
    result = run(rows, {"field": "x", "window": 2})
    assert result[0]["x"] == 10
    assert result[0]["y"] == "a"
    assert result[1]["x"] == 20
    assert result[1]["y"] == "b"


def test_run_handles_non_numeric_values():
    rows = [{"x": 10}, {"x": "bad"}, {"x": 30}]
    result = run(rows, {"field": "x", "window": 2})
    assert result[0]["x_rolling_avg"] == 10.0
    assert result[1]["x_rolling_avg"] is None
    assert result[2]["x_rolling_avg"] == 20.0  # avg of [10, 30]


def test_run_with_sort_by():
    rows = [
        {"idx": 3, "x": 30},
        {"idx": 1, "x": 10},
        {"idx": 2, "x": 20},
    ]
    result = run(rows, {"field": "x", "window": 2, "sort_by": "idx"})
    # After sorting by idx: 10, 20, 30
    assert result[0]["x"] == 10
    assert result[0]["x_rolling_avg"] == 10.0
    assert result[1]["x_rolling_avg"] == 15.0
    assert result[2]["x_rolling_avg"] == 25.0


def test_log_message():
    assert log({"field": "sales", "window": 7}) == "Computed 7-period rolling average of sales."
    assert log({"field": "x"}) == "Computed 3-period rolling average of x."
