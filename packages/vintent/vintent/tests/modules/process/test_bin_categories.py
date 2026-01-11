import pytest
from vintent.modules.process.analyze.bin_categories import run, log


def test_run_empty_rows_returns_empty():
    assert run([], {"field": "category"}) == []


def test_run_returns_rows_if_no_field():
    rows = [{"category": "A"}]
    result = run(rows, {})
    assert result == rows


def test_run_bins_low_frequency_categories():
    rows = [
        {"cat": "A"},
        {"cat": "A"},
        {"cat": "A"},
        {"cat": "B"},
        {"cat": "B"},
        {"cat": "C"},
    ]
    result = run(rows, {"field": "cat", "top_n": 2})
    categories = [r["cat"] for r in result]
    # A and B should remain, C becomes "Other"
    assert categories.count("A") == 3
    assert categories.count("B") == 2
    assert categories.count("Other") == 1
    assert "C" not in categories


def test_run_custom_other_label():
    rows = [
        {"cat": "A"},
        {"cat": "A"},
        {"cat": "B"},
    ]
    result = run(rows, {"field": "cat", "top_n": 1, "other_label": "Rest"})
    categories = [r["cat"] for r in result]
    assert "Rest" in categories
    assert "Other" not in categories


def test_run_preserves_original_structure():
    rows = [
        {"cat": "A", "value": 10},
        {"cat": "B", "value": 20},
    ]
    result = run(rows, {"field": "cat", "top_n": 1})
    assert all("value" in r for r in result)


def test_run_handles_none_values():
    rows = [
        {"cat": "A"},
        {"cat": None},
        {"cat": "B"},
    ]
    result = run(rows, {"field": "cat", "top_n": 1})
    # None should remain None, not become "Other"
    assert any(r["cat"] is None for r in result)


def test_run_all_categories_kept_if_under_top_n():
    rows = [
        {"cat": "A"},
        {"cat": "B"},
        {"cat": "C"},
    ]
    result = run(rows, {"field": "cat", "top_n": 10})
    categories = set(r["cat"] for r in result)
    assert categories == {"A", "B", "C"}


def test_log_message():
    assert log({"field": "category", "top_n": 5}) == "Kept top 5 categories in category, grouped others as 'Other'."


def test_log_message_custom_label():
    assert log({"field": "type", "top_n": 3, "other_label": "Misc"}) == "Kept top 3 categories in type, grouped others as 'Misc'."
