import pytest
from vintent.modules.process.analyze.extract_date_parts import run, log


def test_run_empty_rows_returns_empty():
    assert run([], {"field": "date"}) == []


def test_run_returns_rows_if_no_field():
    rows = [{"date": "2024-06-15"}]
    result = run(rows, {})
    assert result == rows


def test_run_extracts_default_parts():
    rows = [{"date": "2024-06-15"}]
    result = run(rows, {"field": "date"})
    assert result[0]["date_year"] == 2024
    assert result[0]["date_month"] == 6
    assert result[0]["date_day"] == 15


def test_run_extracts_specified_parts():
    rows = [{"date": "2024-06-15"}]
    result = run(rows, {"field": "date", "parts": ["year", "quarter"]})
    assert result[0]["date_year"] == 2024
    assert result[0]["date_quarter"] == 2
    assert "date_month" not in result[0]


def test_run_extracts_weekday():
    rows = [{"date": "2024-01-01"}]  # Monday
    result = run(rows, {"field": "date", "parts": ["weekday"]})
    assert result[0]["date_weekday"] == "Monday"


def test_run_extracts_week():
    rows = [{"date": "2024-01-15"}]
    result = run(rows, {"field": "date", "parts": ["week"]})
    assert "date_week" in result[0]
    assert isinstance(result[0]["date_week"], int)


def test_run_extracts_quarter():
    rows = [
        {"date": "2024-01-15"},  # Q1
        {"date": "2024-04-15"},  # Q2
        {"date": "2024-07-15"},  # Q3
        {"date": "2024-10-15"},  # Q4
    ]
    result = run(rows, {"field": "date", "parts": ["quarter"]})
    assert result[0]["date_quarter"] == 1
    assert result[1]["date_quarter"] == 2
    assert result[2]["date_quarter"] == 3
    assert result[3]["date_quarter"] == 4


def test_run_extracts_hour():
    rows = [{"date": "2024-06-15T14:30:00"}]
    result = run(rows, {"field": "date", "parts": ["hour"]})
    assert result[0]["date_hour"] == 14


def test_run_handles_datetime_with_time():
    rows = [{"date": "2024-06-15 10:30:00"}]
    result = run(rows, {"field": "date", "parts": ["year", "hour"]})
    assert result[0]["date_year"] == 2024
    assert result[0]["date_hour"] == 10


def test_run_handles_unparseable_date():
    rows = [{"date": "invalid"}]
    result = run(rows, {"field": "date", "parts": ["year", "month"]})
    assert result[0]["date_year"] is None
    assert result[0]["date_month"] is None


def test_run_preserves_original_values():
    rows = [{"date": "2024-06-15", "value": 100}]
    result = run(rows, {"field": "date", "parts": ["year"]})
    assert result[0]["date"] == "2024-06-15"
    assert result[0]["value"] == 100


def test_log_message():
    assert log({"field": "created_at", "parts": ["year", "month"]}) == "Extracted year, month from created_at."


def test_log_message_default_parts():
    assert log({"field": "date"}) == "Extracted year, month, day from date."
