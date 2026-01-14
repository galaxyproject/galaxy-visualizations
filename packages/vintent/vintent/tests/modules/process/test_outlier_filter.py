import pytest
from vintent.modules.process.analyze.outlier_filter import run, log


def test_run_empty_rows_returns_empty():
    assert run([], {"field": "x"}) == []


def test_run_returns_all_if_no_field():
    rows = [{"x": 1}, {"x": 100}]
    result = run(rows, {})
    assert result == rows


def test_run_returns_all_if_fewer_than_4_values():
    rows = [{"x": 1}, {"x": 2}, {"x": 3}]
    result = run(rows, {"field": "x"})
    assert result == rows


def test_run_iqr_removes_outliers():
    # Create data with clear outlier
    rows = [{"x": v} for v in [10, 11, 12, 13, 14, 15, 100]]
    result = run(rows, {"field": "x", "method": "iqr", "threshold": 1.5})
    # 100 should be removed as outlier
    values = [r["x"] for r in result]
    assert 100 not in values
    assert len(result) < len(rows)


def test_run_zscore_removes_outliers():
    # Create data with clear outlier
    rows = [{"x": v} for v in [10, 11, 12, 13, 14, 15, 100]]
    result = run(rows, {"field": "x", "method": "zscore", "threshold": 2.0})
    values = [r["x"] for r in result]
    assert 100 not in values


def test_run_keeps_non_numeric_rows():
    rows = [
        {"x": 10},
        {"x": "text"},
        {"x": 11},
        {"x": 12},
        {"x": 13},
    ]
    result = run(rows, {"field": "x"})
    # Non-numeric row should be kept
    assert any(r.get("x") == "text" for r in result)


def test_run_handles_zero_variance():
    rows = [{"x": 5}, {"x": 5}, {"x": 5}, {"x": 5}]
    result = run(rows, {"field": "x", "method": "zscore"})
    assert result == rows


def test_log_message_iqr():
    assert log({"field": "value", "method": "iqr", "threshold": 1.5}) == "Removed outliers from value using IQR (threshold=1.5)."


def test_log_message_zscore():
    assert log({"field": "value", "method": "zscore", "threshold": 3.0}) == "Removed outliers from value using Z-score (threshold=3.0)."


def test_log_message_defaults():
    assert "IQR" in log({"field": "x"})
