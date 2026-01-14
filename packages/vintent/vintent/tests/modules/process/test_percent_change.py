import pytest
from vintent.modules.process.analyze.percent_change import run, log


def test_run_empty_rows_returns_empty():
    assert run([], {"field": "x"}) == []


def test_run_returns_rows_if_no_field():
    rows = [{"x": 1}, {"x": 2}]
    result = run(rows, {})
    assert result == rows


def test_run_computes_percent_change():
    rows = [{"x": 100}, {"x": 110}, {"x": 99}]
    result = run(rows, {"field": "x"})

    # First row: no previous value
    assert result[0]["x_pct_change"] is None
    # Second row: (110 - 100) / 100 * 100 = 10%
    assert result[1]["x_pct_change"] == pytest.approx(10.0)
    # Third row: (99 - 110) / 110 * 100 = -10%
    assert result[2]["x_pct_change"] == pytest.approx(-10.0)


def test_run_preserves_original_values():
    rows = [{"x": 100, "y": "a"}, {"x": 200, "y": "b"}]
    result = run(rows, {"field": "x"})
    assert result[0]["x"] == 100
    assert result[0]["y"] == "a"


def test_run_handles_zero_value():
    rows = [{"x": 0}, {"x": 100}]
    result = run(rows, {"field": "x"})
    # Division by zero should result in None
    assert result[0]["x_pct_change"] is None
    assert result[1]["x_pct_change"] is None  # prev was 0


def test_run_handles_non_numeric_values():
    rows = [{"x": 100}, {"x": "bad"}, {"x": 200}]
    result = run(rows, {"field": "x"})
    assert result[0]["x_pct_change"] is None
    assert result[1]["x_pct_change"] is None
    # Third row still compares to 100 (last valid)
    assert result[2]["x_pct_change"] == pytest.approx(100.0)


def test_run_with_sort_by():
    rows = [
        {"idx": 2, "x": 200},
        {"idx": 1, "x": 100},
    ]
    result = run(rows, {"field": "x", "sort_by": "idx"})
    # After sorting: 100, 200
    assert result[0]["x_pct_change"] is None
    assert result[1]["x_pct_change"] == pytest.approx(100.0)


def test_run_negative_values():
    rows = [{"x": -100}, {"x": -50}]
    result = run(rows, {"field": "x"})
    # (-50 - (-100)) / |-100| * 100 = 50%
    assert result[1]["x_pct_change"] == pytest.approx(50.0)


def test_log_message():
    assert log({"field": "price"}) == "Computed percent change for price."
