import pytest
from vintent.modules.process.analyze.cumulative_sum import run, log


def test_run_empty_rows_returns_empty():
    assert run([], {"field": "x"}) == []


def test_run_returns_rows_if_no_field():
    rows = [{"x": 1}, {"x": 2}]
    result = run(rows, {})
    assert result == rows


def test_run_computes_cumulative_sum():
    rows = [{"x": 10}, {"x": 20}, {"x": 30}]
    result = run(rows, {"field": "x"})

    assert result[0]["x_cumsum"] == 10
    assert result[1]["x_cumsum"] == 30
    assert result[2]["x_cumsum"] == 60


def test_run_preserves_original_values():
    rows = [{"x": 10, "y": "a"}, {"x": 20, "y": "b"}]
    result = run(rows, {"field": "x"})
    assert result[0]["x"] == 10
    assert result[0]["y"] == "a"


def test_run_handles_non_numeric_values():
    rows = [{"x": 10}, {"x": "bad"}, {"x": 30}]
    result = run(rows, {"field": "x"})
    assert result[0]["x_cumsum"] == 10
    # Non-numeric keeps previous cumsum
    assert result[1]["x_cumsum"] == 10
    assert result[2]["x_cumsum"] == 40


def test_run_with_sort_by():
    rows = [
        {"idx": 3, "x": 30},
        {"idx": 1, "x": 10},
        {"idx": 2, "x": 20},
    ]
    result = run(rows, {"field": "x", "sort_by": "idx"})
    # After sorting by idx: 10, 20, 30
    assert result[0]["x_cumsum"] == 10
    assert result[1]["x_cumsum"] == 30
    assert result[2]["x_cumsum"] == 60


def test_run_with_negative_values():
    rows = [{"x": 10}, {"x": -5}, {"x": 3}]
    result = run(rows, {"field": "x"})
    assert result[0]["x_cumsum"] == 10
    assert result[1]["x_cumsum"] == 5
    assert result[2]["x_cumsum"] == 8


def test_log_message():
    assert log({"field": "revenue"}) == "Computed cumulative sum of revenue."
