"""Aggregating by a column, and what happens when the request does not name one."""

from olit.registry.extensions.vintent.modules.process.analyze.group_aggregate import run

ROWS = [
    {"city": "ankara", "sales": 10},
    {"city": "ankara", "sales": 20},
    {"city": "izmir", "sales": 5},
]


def test_count_needs_no_metric():
    assert run(ROWS, {"group_by": "city", "op": "count"}) == [
        {"city": "ankara", "count": 2},
        {"city": "izmir", "count": 1},
    ]


def test_every_other_op_reduces_a_column():
    assert run(ROWS, {"group_by": "city", "op": "sum", "metric": "sales"}) == [
        {"city": "ankara", "sales": 30.0},
        {"city": "izmir", "sales": 5.0},
    ]


def test_a_reducing_op_with_no_metric_returns_the_rows():
    """It used to read column None from every row, find nothing finite, and return an empty table."""
    assert run(ROWS, {"group_by": "city", "op": "sum"}) == ROWS


def test_run_returns_rows_if_no_group_by():
    assert run(ROWS, {"op": "count"}) == ROWS
