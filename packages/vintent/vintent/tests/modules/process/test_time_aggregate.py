import pytest
from vintent.modules.process.analyze.time_aggregate import run, log


def test_run_empty_rows_returns_empty():
    assert run([], {"date_field": "date"}) == []


def test_run_returns_rows_if_no_date_field():
    rows = [{"date": "2024-01-01", "value": 10}]
    result = run(rows, {})
    assert result == rows


def test_run_aggregates_by_month():
    rows = [
        {"date": "2024-01-15", "value": 10},
        {"date": "2024-01-20", "value": 20},
        {"date": "2024-02-10", "value": 30},
    ]
    result = run(rows, {"date_field": "date", "period": "month", "metric": "value", "op": "sum"})
    assert len(result) == 2
    jan = next(r for r in result if r["period"] == "2024-01")
    feb = next(r for r in result if r["period"] == "2024-02")
    assert jan["value"] == 30  # 10 + 20
    assert feb["value"] == 30


def test_run_aggregates_by_year():
    rows = [
        {"date": "2023-06-01", "value": 100},
        {"date": "2024-01-01", "value": 200},
        {"date": "2024-06-01", "value": 300},
    ]
    result = run(rows, {"date_field": "date", "period": "year", "metric": "value", "op": "sum"})
    assert len(result) == 2
    y2023 = next(r for r in result if r["period"] == "2023")
    y2024 = next(r for r in result if r["period"] == "2024")
    assert y2023["value"] == 100
    assert y2024["value"] == 500


def test_run_aggregates_by_day():
    rows = [
        {"date": "2024-01-01", "value": 10},
        {"date": "2024-01-01", "value": 20},
        {"date": "2024-01-02", "value": 30},
    ]
    result = run(rows, {"date_field": "date", "period": "day", "metric": "value", "op": "sum"})
    assert len(result) == 2


def test_run_count_operation():
    rows = [
        {"date": "2024-01-15"},
        {"date": "2024-01-20"},
        {"date": "2024-02-10"},
    ]
    result = run(rows, {"date_field": "date", "period": "month", "op": "count"})
    jan = next(r for r in result if r["period"] == "2024-01")
    feb = next(r for r in result if r["period"] == "2024-02")
    assert jan["count"] == 2
    assert feb["count"] == 1


def test_run_mean_operation():
    rows = [
        {"date": "2024-01-01", "value": 10},
        {"date": "2024-01-15", "value": 30},
    ]
    result = run(rows, {"date_field": "date", "period": "month", "metric": "value", "op": "mean"})
    assert result[0]["value"] == 20.0


def test_run_min_max_operations():
    rows = [
        {"date": "2024-01-01", "value": 10},
        {"date": "2024-01-15", "value": 30},
        {"date": "2024-01-20", "value": 20},
    ]
    result_min = run(rows, {"date_field": "date", "period": "month", "metric": "value", "op": "min"})
    result_max = run(rows, {"date_field": "date", "period": "month", "metric": "value", "op": "max"})
    assert result_min[0]["value"] == 10
    assert result_max[0]["value"] == 30


def test_run_skips_unparseable_dates():
    rows = [
        {"date": "2024-01-01", "value": 10},
        {"date": "invalid", "value": 20},
        {"date": "2024-01-02", "value": 30},
    ]
    result = run(rows, {"date_field": "date", "period": "month", "metric": "value", "op": "sum"})
    assert result[0]["value"] == 40  # Only valid dates


def test_log_message_count():
    assert log({"date_field": "created", "period": "month", "op": "count"}) == "Aggregated by month from created, counted rows."


def test_log_message_with_metric():
    assert log({"date_field": "date", "period": "year", "metric": "sales", "op": "sum"}) == "Aggregated by year from date, computed sum of sales."
