"""Binning a column, and what happens when the request does not name one."""

from olit.registry.extensions.vintent.modules.process.analyze.compute_bins import run

ROWS = [{"x": 1}, {"x": 5}, {"x": 9}]


def test_bins_span_the_column():
    out = run(ROWS, {"field": "x", "bins": 2})

    assert [row["bin_start"] for row in out] == [1.0, 5.0]
    assert out[-1]["bin_end"] == 9.0


def test_run_returns_rows_if_no_field():
    """It used to read column None from every row and return an empty table."""
    assert run(ROWS, {"bins": 2}) == ROWS
