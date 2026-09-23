"""A referenced spec must only encode fields the file actually provides."""

import pathlib

from olit.registry.extensions.vintent.bridge import _compile
from olit.registry.extensions.vintent.modules.profiler import rows_from_tabular, source_format
from olit.registry.extensions.vintent.modules.registry import SHELLS

DATA = pathlib.Path(__file__).parent / "data"
TAB = (DATA / "vintent-dataset.tabular").read_text()
CSV = (DATA / "vintent-dataset.csv").read_text()


# What a transform invents without an explicit `as`.
TRANSFORM_DEFAULTS = {
    "density": ("value", "density"),
    "quantile": ("prob", "value"),
    "fold": ("key", "value"),
}


def _fields_in(spec):
    """Every field name the encoding actually reads."""
    names = set()
    for channel in (spec.get("encoding") or {}).values():
        for entry in channel if isinstance(channel, list) else [channel]:
            if isinstance(entry, dict) and entry.get("field"):
                names.add(entry["field"])
    return names


def _fields_produced_by(spec):
    """Names a transform creates; absent from the file by design."""
    made = set()
    for step in spec.get("transform") or []:
        if not isinstance(step, dict):
            continue
        alias = step.get("as")
        if isinstance(alias, str):
            made.add(alias)
        elif isinstance(alias, list):
            made.update(a for a in alias if isinstance(a, str))
        for kind, defaults in TRANSFORM_DEFAULTS.items():
            if kind in step and "as" not in step:
                made.update(defaults)
        # nested `as`
        for nested in ("aggregate", "joinaggregate", "window"):
            for item in step.get(nested) or []:
                if isinstance(item, dict) and isinstance(item.get("as"), str):
                    made.add(item["as"])
        # bin as a transform writes _start/_end
        if "bin" in step and isinstance(step.get("field"), str):
            made.update({f"{step['field']}_start", f"{step['field']}_end"})
    return made


def _compiled(shell_id, values, params, source, dataset_id="d1"):
    return _compile(shell_id=shell_id, values=values, params=params,
                    dataset_id=dataset_id, source=source, transformed=False)


def test_a_referenced_spec_only_encodes_columns_the_file_provides():
    values = rows_from_tabular(TAB)
    source = source_format(TAB)
    available = set(source["header"])
    checked = 0
    for shell_id in SHELLS:
        params = {k: "col:3" for k in ("x", "field", "metric", "value")}
        params.update({"y": "col:7", "group_by": "col:11", "category": "col:11", "op": "mean"})
        try:
            out = _compiled(shell_id, values, params, source)
        except Exception:
            continue  # shell refused these params
        spec = out["spec"]
        if out["embedded"]:
            continue
        checked += 1
        unresolvable = _fields_in(spec) - available - _fields_produced_by(spec)
        assert not unresolvable, (
            f"{shell_id} references the dataset but encodes {sorted(unresolvable)}, "
            f"which the file does not contain"
        )
    assert checked, "no shell referenced the dataset; the guard tested nothing"


def test_a_shell_that_reshapes_rows_while_compiling_never_references():
    """treemap and parallel_coordinates rebuild rows inside compile."""
    values = rows_from_tabular(TAB)
    source = source_format(TAB)
    for shell_id, params in (
        ("treemap", {"category": "col:11", "value": "col:3", "op": "sum"}),
        ("parallel_coordinates", {"dimensions": ["col:3", "col:7"]}),
    ):
        out = _compiled(shell_id, values, params, source)
        assert out["embedded"], f"{shell_id} reshapes its rows and must embed them"
        assert "url" not in out["spec"]["data"]


def test_csv_is_referenced_without_a_header_because_the_file_names_its_own():
    values = rows_from_tabular(CSV)
    out = _compiled("scatter", values, {"x": "Glucose", "y": "BMI"}, source_format(CSV))
    assert out["spec"]["data"]["format"] == {"type": "csv"}
    assert "header" not in out["spec"]["data"]["format"]


def test_without_a_dataset_id_the_rows_still_travel():
    values = rows_from_tabular(TAB)
    out = _compile(shell_id="scatter", values=values, params={"x": "col:3", "y": "col:7"},
                   dataset_id=None, source=source_format(TAB), transformed=False)
    assert out["embedded"]
    assert out["spec"]["data"]["values"] == values
