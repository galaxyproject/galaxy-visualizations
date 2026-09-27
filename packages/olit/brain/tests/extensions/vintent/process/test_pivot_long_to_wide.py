"""A pivot names its new columns after the key column's values, which need not be strings."""

from olit.registry.extensions.vintent.modules.process.analyze.pivot_long_to_wide import run

LONG = [
    {"id": "a", "k": 1, "v": 10},
    {"id": "a", "k": 2, "v": 20},
    {"id": "b", "k": 1, "v": 30},
]


def test_a_numeric_key_column_still_produces_column_names():
    """The keys came back as ints, so the profiler named a field 5 and the planner asked for "5"."""
    out = run(LONG, {"id": "id", "key": "k", "value": "v"})

    assert [sorted(row) for row in out] == [["1", "2", "id"], ["1", "2", "id"]]


def test_a_cell_with_no_value_is_null_rather_than_absent():
    out = run(LONG, {"id": "id", "key": "k", "value": "v"})

    assert out[1] == {"id": "b", "1": 30.0, "2": None}


def test_run_returns_rows_if_a_column_is_not_named():
    assert run(LONG, {"id": "id", "key": "k"}) == LONG
