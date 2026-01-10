import pytest
from vintent.modules.process.analyze.covariance import schema, run

def test_schema_returns_none_when_not_asked():
    profile = {
        "fields": {
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
        }
    }
    context = [{"role": "user", "content": "show me correlations"}]
    assert schema(profile, context) is None

def test_schema_returns_none_with_insufficient_quantitative_columns():
    profile = {
        "fields": {
            "a": {"type": "quantitative"},
            "b": {"type": "nominal"},
        }
    }
    context = [{"role": "user", "content": "covariance"}]
    assert schema(profile, context) is None

def test_schema_valid_with_typo_and_two_quantitative_columns():
    profile = {
        "fields": {
            "a": {"type": "quantitative"},
            "b": {"type": "quantitative"},
            "c": {"type": "nominal"},
        }
    }
    context = [{"role": "user", "content": "covariace"}]
    s = schema(profile, context)
    assert s is not None
    assert s["id"] == "covariance"
    assert s["phase"] == "analyze"
    props = s["params"]["properties"]["columns"]["items"]["enum"]
    assert set(props) == {"a", "b"}

def test_run_computes_covariance_matrix_shape():
    rows = [
        {"a": 1, "b": 2},
        {"a": 2, "b": 4},
        {"a": 3, "b": 6},
    ]
    params = {"columns": ["a", "b"]}
    out = run(rows, params)
    assert len(out) == 4
    keys = {(o["x"], o["y"]) for o in out}
    assert keys == {("a", "a"), ("a", "b"), ("b", "a"), ("b", "b")}

def test_run_ignores_rows_with_nan_or_invalid_values():
    rows = [
        {"a": 1, "b": 2},
        {"a": "x", "b": 3},
        {"a": 2, "b": float("nan")},
        {"a": 3, "b": 6},
    ]
    params = {"columns": ["a", "b"]}
    out = run(rows, params)
    assert len(out) == 4

def test_run_raises_on_insufficient_valid_rows():
    rows = [
        {"a": 1, "b": 2},
        {"a": "x", "b": "y"},
    ]
    params = {"columns": ["a", "b"]}
    with pytest.raises(Exception) as exc:
        run(rows, params)
    assert "covariance_invalid_shape" in str(exc.value)
