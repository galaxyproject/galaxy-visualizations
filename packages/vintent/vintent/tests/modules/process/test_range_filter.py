import pytest
from vintent.modules.process.extract.range_filter import schema, run, log

# Context with a user message containing a filter keyword
FILTER_CONTEXT = [{"role": "user", "content": "Show values greater than 5"}]


def test_schema_returns_none_without_quantitative_columns():
    profile = {
        "fields": {
            "a": {"type": "nominal"},
            "b": {"type": "nominal"},
        }
    }
    # With filter keywords but no quantitative columns, should return None
    assert schema(profile, context=FILTER_CONTEXT) is None


def test_schema_returns_false_without_filter_keywords():
    profile = {
        "fields": {
            "a": {"type": "quantitative"},
        }
    }
    # Without filter keywords in context, should return False
    assert schema(profile, context=[{"role": "user", "content": "show me a chart"}]) is False


def test_schema_valid_with_quantitative_columns():
    profile = {
        "fields": {
            "a": {"type": "quantitative"},
            "b": {"type": "nominal"},
            "c": {"type": "quantitative"},
        }
    }
    s = schema(profile, context=FILTER_CONTEXT)
    assert s is not None
    assert s["id"] == "range_filter"
    assert s["phase"] == "extract"
    enum = s["params"]["properties"]["field"]["enum"]
    assert set(enum) == {"a", "c"}

def test_run_filters_with_min_only():
    rows = [
        {"x": 1},
        {"x": 5},
        {"x": 10},
    ]
    params = {"field": "x", "min": 5}
    out = run(rows, params)
    assert out == [{"x": 5}, {"x": 10}]

def test_run_filters_with_max_only():
    rows = [
        {"x": 1},
        {"x": 5},
        {"x": 10},
    ]
    params = {"field": "x", "max": 5}
    out = run(rows, params)
    assert out == [{"x": 1}, {"x": 5}]

def test_run_filters_with_min_and_max():
    rows = [
        {"x": 1},
        {"x": 5},
        {"x": 10},
    ]
    params = {"field": "x", "min": 2, "max": 8}
    out = run(rows, params)
    assert out == [{"x": 5}]

def test_run_ignores_non_numeric_values():
    rows = [
        {"x": 1},
        {"x": "bad"},
        {"x": 3},
    ]
    params = {"field": "x", "min": 2}
    out = run(rows, params)
    assert out == [{"x": 3}]

def test_run_returns_all_rows_if_field_missing():
    rows = [
        {"a": 1},
        {"a": 2},
    ]
    params = {"field": "x", "min": 1}
    out = run(rows, params)
    assert out == rows

def test_run_empty_rows_returns_empty():
    params = {"field": "x", "min": 1}
    assert run([], params) == []

def test_log_messages():
    assert log({"field": "x", "min": 1, "max": 5}) == "Filter rows where x is between 1 and 5."
    assert log({"field": "x", "min": 1}) == "Filter rows where x is >= 1."
    assert log({"field": "x", "max": 5}) == "Filter rows where x is <= 5."
    assert log({"field": "x"}) == "No filtering applied on x."
