"""The model writes the spec; Olit writes the only data source it gets.

Shapes and counts here are from real Galaxy datasets, read through vega-loader 5.30 to confirm
each parses the way Galaxy measures it.
"""

import pytest

from olit.loop import vega

# tabular, no column names, nothing to skip.
TABULAR = {
    "id": "d1",
    "name": "prices.tabular",
    "state": "ok",
    "metadata_columns": 4,
    "metadata_column_names": [],
    "metadata_column_types": ["str", "str", "int", "str"],
    "metadata_delimiter": "\t",
    "metadata_comment_lines": 0,
    "metadata_data_lines": 61,
    "file_size": 2500,
}
# csv, where Galaxy names the columns and counts the header row as a comment.
CSV = {
    **TABULAR,
    "name": "prices.csv",
    "metadata_column_names": ["Transaction_date", "Product", "Price", "Country"],
    "metadata_delimiter": ",",
    "metadata_comment_lines": 1,
    "metadata_data_lines": 60,
}
# vcf, whose `##` preamble vega-loader reads as five more data rows.
VCF = {**TABULAR, "name": "calls.vcf", "metadata_columns": 8, "metadata_comment_lines": 5, "metadata_data_lines": 6}
# gtf, which Galaxy never measured.
UNMEASURED = {**TABULAR, "name": "genes.gtf", "metadata_data_lines": None, "metadata_comment_lines": None}

SCATTER = {
    "mark": "point",
    "encoding": {"x": {"field": "col:3", "type": "quantitative"}, "y": {"field": "col:1", "type": "nominal"}},
}


def built(spec, details=TABULAR):
    return vega.build("abc123", spec, details)


# --- the data source ---------------------------------------------------------


def test_a_dataset_without_names_is_read_by_position():
    ready, refusal = built(SCATTER)
    assert refusal is None
    assert ready["data"] == {
        "url": "/api/datasets/abc123/display",
        "format": {
            "type": "dsv",
            "delimiter": "\t",
            "header": ["col:1", "col:2", "col:3", "col:4"],
            "parse": {"col:3": "number"},
        },
    }


def test_a_csv_lets_its_own_header_name_the_columns():
    spec = {"mark": "point", "encoding": {"x": {"field": "Price", "type": "quantitative"}}}
    ready, refusal = vega.build("abc123", spec, CSV)
    assert refusal is None
    assert ready["data"]["format"] == {"type": "csv", "parse": {"Price": "number"}}


def test_the_schema_is_the_one_galaxy_renders_with():
    ready, _ = built(SCATTER)
    assert ready["$schema"] == "https://vega.github.io/schema/vega-lite/v5.json"


def test_a_caller_cannot_choose_the_schema():
    ready, _ = built({**SCATTER, "$schema": "https://vega.github.io/schema/vega-lite/v6.json"})
    assert ready["$schema"].endswith("v5.json")


def test_numeric_columns_are_parsed_as_numbers_and_text_is_left_alone():
    ready, _ = built(SCATTER)
    assert ready["data"]["format"]["parse"] == {"col:3": "number"}


# --- the data invariant ------------------------------------------------------


@pytest.mark.parametrize(
    "spec",
    [
        {"data": {"values": [{"a": 1}]}, "mark": "point"},
        {"data": {"url": "https://example.org/x.csv"}, "mark": "point"},
        {"layer": [{"data": {"values": []}, "mark": "line"}], "mark": "point"},
        {"mark": "point", "transform": [{"lookup": "a", "from": {"data": {"values": []}, "key": "a"}}]},
        {"hconcat": [{"data": {"url": "/elsewhere"}, "mark": "bar"}]},
        {"facet": {"field": "col:1"}, "spec": {"data": {"values": []}, "mark": "bar"}},
    ],
)
def test_a_spec_may_not_name_data_of_its_own(spec):
    ready, refusal = built(spec)
    assert ready is None
    assert "names its own data" in refusal


def test_the_refusal_names_where_the_data_was():
    _, refusal = built({"layer": [{"data": {"values": []}, "mark": "line"}]})
    assert "layer.0.data" in refusal


def test_a_lookup_without_its_own_data_is_left_alone():
    """`from.data` is the escape; a lookup naming no data is an ordinary transform."""
    spec = {"mark": "point", "transform": [{"calculate": "datum['col:3'] * 2", "as": "doubled"}]}
    ready, refusal = built({**spec, "encoding": {"x": {"field": "doubled", "type": "quantitative"}}})
    assert refusal is None
    assert "url" in ready["data"]


# --- which datasets can be referenced at all ---------------------------------


def test_a_file_whose_comments_vega_would_read_as_data_is_refused():
    _, refusal = built(SCATTER, VCF)
    assert "first 5 line(s) are comments" in refusal
    assert "Galaxy tool" in refusal


def test_a_header_row_is_not_a_comment_galaxy_cannot_skip():
    """A csv's `comment_lines: 1` is its header, which `type: csv` consumes."""
    assert vega.unreferenceable(CSV) is None


def test_a_dataset_galaxy_never_measured_is_refused():
    _, refusal = built(SCATTER, UNMEASURED)
    assert "has not measured" in refusal


def test_a_dataset_too_large_to_send_to_every_reader_is_refused():
    _, refusal = built(SCATTER, {**TABULAR, "file_size": vega.SIZE_LIMIT + 1})
    assert "sends the whole file to every reader" in refusal


def test_a_dataset_with_no_column_count_is_refused():
    _, refusal = built(SCATTER, {**TABULAR, "metadata_columns": None})
    assert "no column count" in refusal


def test_named_columns_with_an_unverified_delimiter_are_refused():
    named_tsv = {**CSV, "metadata_delimiter": "\t"}
    _, refusal = built(SCATTER, named_tsv)
    assert "has not been verified" in refusal


# --- field names -------------------------------------------------------------


def test_a_field_the_dataset_does_not_hold_is_refused():
    _, refusal = built({"mark": "point", "encoding": {"x": {"field": "Glucose", "type": "quantitative"}}})
    assert "does not hold" in refusal
    assert "'col:1'" in refusal


def test_a_field_a_transform_produces_is_accepted():
    spec = {
        "mark": "bar",
        "transform": [{"aggregate": [{"op": "mean", "field": "col:3", "as": "avg"}], "groupby": ["col:1"]}],
        "encoding": {"x": {"field": "col:1", "type": "nominal"}, "y": {"field": "avg", "type": "quantitative"}},
    }
    _, refusal = built(spec)
    assert refusal is None


def test_the_default_names_of_a_transform_are_accepted():
    spec = {
        "mark": "area",
        "transform": [{"density": "col:3"}],
        "encoding": {
            "x": {"field": "value", "type": "quantitative"},
            "y": {"field": "density", "type": "quantitative"},
        },
    }
    _, refusal = built(spec)
    assert refusal is None


def test_a_bin_transform_names_both_edges():
    spec = {
        "mark": "bar",
        "transform": [{"bin": True, "field": "col:3", "as": "b"}],
        "encoding": {"x": {"field": "col:3_start", "type": "quantitative"}},
    }
    _, refusal = built(spec)
    assert refusal is None


def test_a_field_named_only_in_a_filter_is_checked():
    spec = {"mark": "point", "transform": [{"filter": "datum['nope'] > 1"}], "encoding": {}}
    _, refusal = built(spec)
    assert "'nope'" in refusal


def test_a_pivot_makes_the_names_unknowable_so_they_are_not_checked():
    spec = {
        "mark": "bar",
        "transform": [{"pivot": "col:1", "value": "col:3"}],
        "encoding": {"x": {"field": "whatever_the_data_said", "type": "quantitative"}},
    }
    _, refusal = built(spec)
    assert refusal is None


# --- what reaches the page ---------------------------------------------------


def test_the_artifact_renders_as_the_fence_galaxy_parses():
    ready, _ = built(SCATTER)
    text = vega.fence(ready)
    assert text.startswith("```vega\n") and text.endswith("\n```")
    assert '"url": "/api/datasets/abc123/display"' in text


def test_an_empty_spec_is_refused():
    for spec in ({}, None, [], "mark: point"):
        ready, refusal = built(spec)
        assert ready is None and "Vega-Lite specification" in refusal


# --- the dataset has to be readable at all -----------------------------------


def test_a_dataset_whose_job_has_not_finished_says_so_rather_than_blaming_its_datatype():
    """The metadata checks would otherwise report an unmeasured file and invite a conversion."""
    _, refusal = built(SCATTER, {**TABULAR, "state": "running", "metadata_data_lines": None})
    assert "state 'running'" in refusal
    assert "wait for it and chart it again" in refusal
    assert "column count" not in refusal


def test_a_failed_dataset_is_not_something_to_wait_for():
    _, refusal = built(SCATTER, {**TABULAR, "state": "error", "metadata_data_lines": None})
    assert "the job producing it failed" in refusal
    assert "wait for it" not in refusal


def test_a_purged_dataset_is_refused_before_anything_else():
    _, refusal = built(SCATTER, {**TABULAR, "purged": True, "state": "ok"})
    assert "purged" in refusal


def test_the_state_is_named_before_the_metadata_is_questioned():
    """A queued dataset has no measured metadata; the state is the cause worth reporting."""
    queued = {**TABULAR, "state": "queued", "metadata_columns": None, "metadata_data_lines": None}
    _, refusal = built(SCATTER, queued)
    assert "state 'queued'" in refusal


# --- an encoding the column cannot satisfy ------------------------------------


def test_a_quantitative_encoding_on_a_text_column_is_reported_not_refused():
    """Galaxy types a column as text if any value is, so the encoding may still be right."""
    spec = {"mark": "point", "encoding": {"x": {"field": "col:1", "type": "quantitative"}}}
    ready, refusal = built(spec)
    assert refusal is None, "a numeric column with missing values reads as text; do not refuse"
    assert vega.unsatisfiable_types(ready, TABULAR) == ["col:1"]


def test_a_quantitative_encoding_on_a_numeric_column_is_not_reported():
    spec = {"mark": "point", "encoding": {"x": {"field": "col:3", "type": "quantitative"}}}
    ready, _ = built(spec)
    assert vega.unsatisfiable_types(ready, TABULAR) == []


def test_a_nominal_encoding_on_a_text_column_is_not_reported():
    spec = {"mark": "bar", "encoding": {"x": {"field": "col:1", "type": "nominal"}}}
    ready, _ = built(spec)
    assert vega.unsatisfiable_types(ready, TABULAR) == []
