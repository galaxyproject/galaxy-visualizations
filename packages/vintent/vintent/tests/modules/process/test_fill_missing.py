import pytest
import math
from vintent.modules.process.analyze.fill_missing import run, log


def test_run_empty_rows_returns_empty():
    assert run([], {"field": "x"}) == []


def test_run_returns_rows_if_no_field():
    rows = [{"x": None}]
    result = run(rows, {})
    assert result == rows


def test_run_fill_with_mean():
    rows = [
        {"x": 10},
        {"x": None},
        {"x": 30},
    ]
    result = run(rows, {"field": "x", "strategy": "mean"})
    assert result[1]["x"] == 20.0


def test_run_fill_with_median():
    rows = [
        {"x": 10},
        {"x": None},
        {"x": 20},
        {"x": 30},
    ]
    result = run(rows, {"field": "x", "strategy": "median"})
    assert result[1]["x"] == 20.0


def test_run_fill_with_zero():
    rows = [{"x": 10}, {"x": None}]
    result = run(rows, {"field": "x", "strategy": "zero"})
    assert result[1]["x"] == 0


def test_run_fill_with_value():
    rows = [{"x": 10}, {"x": None}]
    result = run(rows, {"field": "x", "strategy": "value", "value": 999})
    assert result[1]["x"] == 999


def test_run_fill_with_mode():
    rows = [
        {"x": "A"},
        {"x": "A"},
        {"x": "B"},
        {"x": None},
    ]
    result = run(rows, {"field": "x", "strategy": "mode"})
    assert result[3]["x"] == "A"


def test_run_fill_with_ffill():
    rows = [
        {"x": 10},
        {"x": None},
        {"x": None},
        {"x": 30},
    ]
    result = run(rows, {"field": "x", "strategy": "ffill"})
    assert result[1]["x"] == 10
    assert result[2]["x"] == 10
    assert result[3]["x"] == 30


def test_run_preserves_original_non_missing():
    rows = [{"x": 10, "y": "a"}, {"x": None, "y": "b"}]
    result = run(rows, {"field": "x", "strategy": "zero"})
    assert result[0]["x"] == 10
    assert result[0]["y"] == "a"
    assert result[1]["y"] == "b"


def test_run_handles_nan_as_missing():
    rows = [{"x": 10}, {"x": float("nan")}, {"x": 30}]
    result = run(rows, {"field": "x", "strategy": "mean"})
    assert result[1]["x"] == 20.0


def test_log_message():
    assert log({"field": "value", "strategy": "mean"}) == "Filled missing values in value using mean strategy."
    assert log({"field": "score", "strategy": "zero"}) == "Filled missing values in score using zero strategy."
