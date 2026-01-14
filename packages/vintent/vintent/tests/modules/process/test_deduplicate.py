import pytest
from vintent.modules.process.extract.deduplicate import schema, run, log


def test_schema_returns_none_without_columns():
    profile = {"fields": {}}
    assert schema(profile) is None


def test_schema_valid_with_columns():
    profile = {"fields": {"a": {"type": "nominal"}, "b": {"type": "quantitative"}}}
    s = schema(profile)
    assert s is not None
    assert s["id"] == "deduplicate"
    assert s["phase"] == "extract"
    assert "description" in s
    assert set(s["params"]["properties"]["subset"]["items"]["enum"]) == {"a", "b"}


def test_run_empty_rows_returns_empty():
    assert run([], {}) == []


def test_run_removes_full_duplicates():
    rows = [
        {"a": 1, "b": 2},
        {"a": 1, "b": 2},
        {"a": 3, "b": 4},
    ]
    result = run(rows, {})
    assert len(result) == 2
    assert result[0] == {"a": 1, "b": 2}
    assert result[1] == {"a": 3, "b": 4}


def test_run_removes_duplicates_by_subset():
    rows = [
        {"a": 1, "b": 2},
        {"a": 1, "b": 3},
        {"a": 2, "b": 4},
    ]
    result = run(rows, {"subset": ["a"]})
    assert len(result) == 2


def test_run_keep_first():
    rows = [
        {"a": 1, "b": "first"},
        {"a": 1, "b": "second"},
    ]
    result = run(rows, {"subset": ["a"], "keep": "first"})
    assert len(result) == 1
    assert result[0]["b"] == "first"


def test_run_keep_last():
    rows = [
        {"a": 1, "b": "first"},
        {"a": 1, "b": "second"},
    ]
    result = run(rows, {"subset": ["a"], "keep": "last"})
    assert len(result) == 1
    assert result[0]["b"] == "second"


def test_run_no_duplicates_returns_all():
    rows = [{"a": 1}, {"a": 2}, {"a": 3}]
    result = run(rows, {})
    assert result == rows


def test_log_message_with_subset():
    assert log({"subset": ["a", "b"], "keep": "first"}) == "Removed duplicates based on [a, b], keeping first."


def test_log_message_without_subset():
    assert log({"keep": "last"}) == "Removed duplicate rows, keeping last."


def test_log_message_default():
    assert log({}) == "Removed duplicate rows, keeping first."
