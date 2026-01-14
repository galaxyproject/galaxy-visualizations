import pytest
from vintent.modules.process.extract.sample_rows import schema, run, log


def test_schema_returns_none_with_fewer_than_2_rows():
    profile = {"row_count": 1, "fields": {"a": {"type": "nominal"}}}
    assert schema(profile) is None


def test_schema_returns_none_with_zero_rows():
    profile = {"row_count": 0, "fields": {}}
    assert schema(profile) is None


def test_schema_valid_with_sufficient_rows():
    profile = {"row_count": 100, "fields": {"a": {"type": "nominal"}}}
    s = schema(profile)
    assert s is not None
    assert s["id"] == "sample_rows"
    assert s["phase"] == "extract"
    assert "description" in s
    assert s["params"]["properties"]["n"]["maximum"] == 100


def test_run_empty_rows_returns_empty():
    assert run([], {"n": 5}) == []


def test_run_samples_correct_number():
    rows = [{"x": i} for i in range(100)]
    result = run(rows, {"n": 10, "seed": 42})
    assert len(result) == 10


def test_run_with_seed_is_reproducible():
    rows = [{"x": i} for i in range(50)]
    result1 = run(rows, {"n": 5, "seed": 123})
    result2 = run(rows, {"n": 5, "seed": 123})
    assert result1 == result2


def test_run_caps_at_available_rows():
    rows = [{"x": 1}, {"x": 2}, {"x": 3}]
    result = run(rows, {"n": 10})
    assert len(result) == 3


def test_run_samples_are_from_original_rows():
    rows = [{"x": i} for i in range(20)]
    result = run(rows, {"n": 5, "seed": 1})
    for row in result:
        assert row in rows


def test_log_message():
    assert log({"n": 25}) == "Sampled 25 random rows."
    assert log({"n": 0}) == "Sampled 0 random rows."
