import pytest
from vintent.modules.process.analyze.correlation_matrix import run, log

def test_run_empty_rows_returns_empty():
    assert run([], {}) == []

def test_run_single_numeric_field_returns_empty():
    rows = [
        {"a": 1, "b": "x"},
        {"a": 2, "b": "y"},
    ]
    assert run(rows, {}) == []

def test_run_two_numeric_fields_produces_full_matrix():
    rows = [
        {"a": 1, "b": 2},
        {"a": 2, "b": 4},
        {"a": 3, "b": 6},
    ]
    out = run(rows, {})
    assert len(out) == 4
    keys = {(o["x"], o["y"]) for o in out}
    assert keys == {("a", "a"), ("a", "b"), ("b", "a"), ("b", "b")}

def test_run_self_correlation_is_one_or_close():
    rows = [
        {"a": 1, "b": 5},
        {"a": 2, "b": 6},
        {"a": 3, "b": 7},
    ]
    out = run(rows, {})
    aa = next(o for o in out if o["x"] == "a" and o["y"] == "a")
    bb = next(o for o in out if o["x"] == "b" and o["y"] == "b")
    assert aa["value"] == pytest.approx(1.0)
    assert bb["value"] == pytest.approx(1.0)

def test_run_handles_zero_variance():
    rows = [
        {"a": 1, "b": 2},
        {"a": 1, "b": 3},
        {"a": 1, "b": 4},
    ]
    out = run(rows, {})
    ab = next(o for o in out if o["x"] == "a" and o["y"] == "b")
    ba = next(o for o in out if o["x"] == "b" and o["y"] == "a")
    assert ab["value"] == 0.0
    assert ba["value"] == 0.0

def test_run_ignores_non_numeric_values():
    rows = [
        {"a": 1, "b": 2},
        {"a": "x", "b": 3},
        {"a": 3, "b": "y"},
        {"a": 4, "b": 5},
    ]
    out = run(rows, {})
    assert len(out) == 4

def test_log_constant_message():
    assert log({}) == "Computed correlation matrix."
