import pytest
from datetime import datetime, timedelta
from vintent.modules.process.extract.date_filter import schema, run, log


def test_schema_returns_none_without_temporal_columns():
    profile = {"fields": {"a": {"type": "nominal"}, "b": {"type": "quantitative"}}}
    assert schema(profile) is None


def test_schema_valid_with_temporal_columns():
    profile = {"fields": {"date": {"type": "temporal"}, "value": {"type": "quantitative"}}}
    s = schema(profile)
    assert s is not None
    assert s["id"] == "date_filter"
    assert s["phase"] == "extract"
    assert "description" in s
    assert s["params"]["properties"]["field"]["enum"] == ["date"]


def test_run_empty_rows_returns_empty():
    assert run([], {"field": "date"}) == []


def test_run_returns_all_if_no_field():
    rows = [{"date": "2024-01-01"}, {"date": "2024-06-01"}]
    result = run(rows, {})
    assert result == rows


def test_run_filters_by_start_date():
    rows = [
        {"date": "2024-01-01"},
        {"date": "2024-06-01"},
        {"date": "2024-12-01"},
    ]
    result = run(rows, {"field": "date", "start": "2024-05-01"})
    assert len(result) == 2
    assert result[0]["date"] == "2024-06-01"
    assert result[1]["date"] == "2024-12-01"


def test_run_filters_by_end_date():
    rows = [
        {"date": "2024-01-01"},
        {"date": "2024-06-01"},
        {"date": "2024-12-01"},
    ]
    result = run(rows, {"field": "date", "end": "2024-07-01"})
    assert len(result) == 2
    assert result[0]["date"] == "2024-01-01"
    assert result[1]["date"] == "2024-06-01"


def test_run_filters_by_date_range():
    rows = [
        {"date": "2024-01-01"},
        {"date": "2024-06-01"},
        {"date": "2024-12-01"},
    ]
    result = run(rows, {"field": "date", "start": "2024-03-01", "end": "2024-09-01"})
    assert len(result) == 1
    assert result[0]["date"] == "2024-06-01"


def test_run_handles_datetime_format_with_time():
    rows = [
        {"date": "2024-01-01T10:00:00"},
        {"date": "2024-06-01T15:30:00"},
    ]
    result = run(rows, {"field": "date", "start": "2024-03-01"})
    assert len(result) == 1


def test_run_skips_unparseable_dates():
    rows = [
        {"date": "2024-01-01"},
        {"date": "invalid"},
        {"date": "2024-06-01"},
    ]
    result = run(rows, {"field": "date", "start": "2024-03-01"})
    assert len(result) == 1
    assert result[0]["date"] == "2024-06-01"


def test_log_message_last_n_days():
    assert log({"field": "created", "last_n_days": 30}) == "Filtered created to last 30 days."


def test_log_message_range():
    assert log({"field": "date", "start": "2024-01-01", "end": "2024-12-31"}) == "Filtered date between 2024-01-01 and 2024-12-31."


def test_log_message_start_only():
    assert log({"field": "date", "start": "2024-01-01"}) == "Filtered date from 2024-01-01 onwards."


def test_log_message_end_only():
    assert log({"field": "date", "end": "2024-12-31"}) == "Filtered date up to 2024-12-31."


def test_log_message_default():
    assert log({"field": "date"}) == "Applied date filter on date."
