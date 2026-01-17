"""Tests for expression operators."""

import pytest

from polaris.modules.exceptions import ExpressionError
from polaris.modules.expressions import (
    EXPR_OPS,
    expr_any,
    expr_coalesce,
    expr_concat,
    expr_count_where,
    expr_eq,
    expr_filter,
    expr_get,
    expr_len,
    expr_lookup,
    expr_not,
    expr_unique,
)


class TestExprConcat:
    def test_concat_strings(self, resolve_identity):
        expr = {"args": ["hello", " ", "world"]}
        result = expr_concat(expr, {}, resolve_identity)
        assert result == "hello world"

    def test_concat_empty(self, resolve_identity):
        expr = {"args": []}
        result = expr_concat(expr, {}, resolve_identity)
        assert result == ""

    def test_concat_mixed_types(self, resolve_identity):
        expr = {"args": ["count: ", 42]}
        result = expr_concat(expr, {}, resolve_identity)
        assert result == "count: 42"


class TestExprCoalesce:
    def test_coalesce_returns_first_non_none(self, resolve_identity):
        expr = {"args": [None, None, "value", "other"]}
        result = expr_coalesce(expr, {}, resolve_identity)
        assert result == "value"

    def test_coalesce_all_none(self, resolve_identity):
        expr = {"args": [None, None]}
        result = expr_coalesce(expr, {}, resolve_identity)
        assert result is None

    def test_coalesce_first_value(self, resolve_identity):
        expr = {"args": ["first", None, "second"]}
        result = expr_coalesce(expr, {}, resolve_identity)
        assert result == "first"


class TestExprGet:
    def test_get_existing_key(self, resolve_identity):
        expr = {"obj": {"name": "test"}, "key": "name", "default": "fallback"}
        result = expr_get(expr, {}, resolve_identity)
        assert result == "test"

    def test_get_missing_key_returns_default(self, resolve_identity):
        expr = {"obj": {"name": "test"}, "key": "missing", "default": "fallback"}
        result = expr_get(expr, {}, resolve_identity)
        assert result == "fallback"

    def test_get_non_dict_returns_default(self, resolve_identity):
        expr = {"obj": "not a dict", "key": "name", "default": "fallback"}
        result = expr_get(expr, {}, resolve_identity)
        assert result == "fallback"


class TestExprLen:
    def test_len_list(self, resolve_identity):
        expr = {"arg": [1, 2, 3]}
        result = expr_len(expr, {}, resolve_identity)
        assert result == 3

    def test_len_string(self, resolve_identity):
        expr = {"arg": "hello"}
        result = expr_len(expr, {}, resolve_identity)
        assert result == 5

    def test_len_none(self, resolve_identity):
        expr = {"arg": None}
        result = expr_len(expr, {}, resolve_identity)
        assert result == 0

    def test_len_empty(self, resolve_identity):
        expr = {"arg": []}
        result = expr_len(expr, {}, resolve_identity)
        assert result == 0


class TestExprEq:
    def test_eq_true(self, resolve_identity):
        expr = {"left": "value", "right": "value"}
        result = expr_eq(expr, {}, resolve_identity)
        assert result is True

    def test_eq_false(self, resolve_identity):
        expr = {"left": "value", "right": "other"}
        result = expr_eq(expr, {}, resolve_identity)
        assert result is False

    def test_eq_numbers(self, resolve_identity):
        expr = {"left": 42, "right": 42}
        result = expr_eq(expr, {}, resolve_identity)
        assert result is True


class TestExprNot:
    def test_not_true(self, resolve_identity):
        expr = {"arg": True}
        result = expr_not(expr, {}, resolve_identity)
        assert result is False

    def test_not_false(self, resolve_identity):
        expr = {"arg": False}
        result = expr_not(expr, {}, resolve_identity)
        assert result is True

    def test_not_truthy(self, resolve_identity):
        expr = {"arg": "non-empty"}
        result = expr_not(expr, {}, resolve_identity)
        assert result is False

    def test_not_falsy(self, resolve_identity):
        expr = {"arg": ""}
        result = expr_not(expr, {}, resolve_identity)
        assert result is True


class TestExprLookup:
    def test_lookup_finds_match(self, resolve_identity):
        expr = {
            "from": [
                {"id": "a", "value": 1},
                {"id": "b", "value": 2},
            ],
            "match": {"field": "id", "equals": "b"},
            "select": "value",
        }
        result = expr_lookup(expr, {}, resolve_identity)
        assert result == 2

    def test_lookup_no_match_raises(self, resolve_identity):
        expr = {
            "from": [{"id": "a", "value": 1}],
            "match": {"field": "id", "equals": "z"},
            "select": "value",
        }
        with pytest.raises(ExpressionError, match="no match"):
            expr_lookup(expr, {}, resolve_identity)

    def test_lookup_missing_select_field_raises(self, resolve_identity):
        expr = {
            "from": [{"id": "a", "value": 1}],
            "match": {"field": "id", "equals": "a"},
            "select": "missing",
        }
        with pytest.raises(ExpressionError, match="select field not found"):
            expr_lookup(expr, {}, resolve_identity)

    def test_lookup_non_array_raises(self, resolve_identity):
        expr = {
            "from": "not an array",
            "match": {"field": "id", "equals": "a"},
            "select": "value",
        }
        with pytest.raises(ExpressionError, match="not an array"):
            expr_lookup(expr, {}, resolve_identity)


class TestExprCountWhere:
    def test_count_where_finds_matches(self, resolve_identity):
        expr = {
            "from": [
                {"status": "ok"},
                {"status": "error"},
                {"status": "ok"},
            ],
            "field": "status",
            "equals": "ok",
        }
        result = expr_count_where(expr, {}, resolve_identity)
        assert result == 2

    def test_count_where_no_matches(self, resolve_identity):
        expr = {
            "from": [{"status": "ok"}],
            "field": "status",
            "equals": "error",
        }
        result = expr_count_where(expr, {}, resolve_identity)
        assert result == 0

    def test_count_where_non_list(self, resolve_identity):
        expr = {
            "from": "not a list",
            "field": "status",
            "equals": "ok",
        }
        result = expr_count_where(expr, {}, resolve_identity)
        assert result == 0


class TestExprAny:
    def test_any_true(self, resolve_identity):
        expr = {
            "from": [
                {"status": "pending"},
                {"status": "done"},
            ],
            "field": "status",
            "equals": "done",
        }
        result = expr_any(expr, {}, resolve_identity)
        assert result is True

    def test_any_false(self, resolve_identity):
        expr = {
            "from": [
                {"status": "pending"},
                {"status": "pending"},
            ],
            "field": "status",
            "equals": "done",
        }
        result = expr_any(expr, {}, resolve_identity)
        assert result is False

    def test_any_non_list(self, resolve_identity):
        expr = {
            "from": "not a list",
            "field": "status",
            "equals": "ok",
        }
        result = expr_any(expr, {}, resolve_identity)
        assert result is False


class TestExprUnique:
    def test_unique_by_field(self, resolve_identity):
        expr = {
            "from": [
                {"id": "a", "value": 1},
                {"id": "b", "value": 2},
                {"id": "a", "value": 3},  # duplicate id
                {"id": "c", "value": 4},
            ],
            "by": "id",
        }
        result = expr_unique(expr, {}, resolve_identity)
        assert len(result) == 3
        assert [r["id"] for r in result] == ["a", "b", "c"]
        # First occurrence is kept
        assert result[0]["value"] == 1

    def test_unique_preserves_order(self, resolve_identity):
        expr = {
            "from": [
                {"id": "c"},
                {"id": "a"},
                {"id": "b"},
                {"id": "a"},  # duplicate
            ],
            "by": "id",
        }
        result = expr_unique(expr, {}, resolve_identity)
        assert [r["id"] for r in result] == ["c", "a", "b"]

    def test_unique_skips_none_values(self, resolve_identity):
        expr = {
            "from": [
                {"id": "a"},
                {"id": None},
                {"id": "b"},
            ],
            "by": "id",
        }
        result = expr_unique(expr, {}, resolve_identity)
        assert len(result) == 2
        assert [r["id"] for r in result] == ["a", "b"]

    def test_unique_non_list_returns_empty(self, resolve_identity):
        expr = {"from": "not a list", "by": "id"}
        result = expr_unique(expr, {}, resolve_identity)
        assert result == []

    def test_unique_no_by_field(self, resolve_identity):
        expr = {"from": [1, 2, 1, 3, 2]}
        result = expr_unique(expr, {}, resolve_identity)
        assert result == [1, 2, 3]


class TestExprFilter:
    def test_filter_eq(self, resolve_identity):
        expr = {
            "from": [
                {"status": "ok", "name": "a"},
                {"status": "error", "name": "b"},
                {"status": "ok", "name": "c"},
            ],
            "where": {"field": "status", "eq": "ok"},
        }
        result = expr_filter(expr, {}, resolve_identity)
        assert len(result) == 2
        assert [r["name"] for r in result] == ["a", "c"]

    def test_filter_ne(self, resolve_identity):
        expr = {
            "from": [
                {"status": "ok", "name": "a"},
                {"status": "error", "name": "b"},
                {"status": "ok", "name": "c"},
            ],
            "where": {"field": "status", "ne": "error"},
        }
        result = expr_filter(expr, {}, resolve_identity)
        assert len(result) == 2
        assert [r["name"] for r in result] == ["a", "c"]

    def test_filter_starts_with(self, resolve_identity):
        expr = {
            "from": [
                {"tool": "__DATA_FETCH__"},
                {"tool": "bwa"},
                {"tool": "__SET_METADATA__"},
                {"tool": "samtools"},
            ],
            "where": {"field": "tool", "starts_with": "__"},
        }
        result = expr_filter(expr, {}, resolve_identity)
        assert len(result) == 2

    def test_filter_not_starts_with(self, resolve_identity):
        expr = {
            "from": [
                {"tool": "__DATA_FETCH__"},
                {"tool": "bwa"},
                {"tool": "__SET_METADATA__"},
                {"tool": "samtools"},
            ],
            "where": {"field": "tool", "not_starts_with": "__"},
        }
        result = expr_filter(expr, {}, resolve_identity)
        assert len(result) == 2
        assert [r["tool"] for r in result] == ["bwa", "samtools"]

    def test_filter_contains(self, resolve_identity):
        expr = {
            "from": [
                {"name": "test_file.fastq"},
                {"name": "results.bam"},
                {"name": "test_output.vcf"},
            ],
            "where": {"field": "name", "contains": "test"},
        }
        result = expr_filter(expr, {}, resolve_identity)
        assert len(result) == 2

    def test_filter_not_null(self, resolve_identity):
        expr = {
            "from": [
                {"job": "j1"},
                {"job": None},
                {"job": "j2"},
            ],
            "where": {"field": "job", "not_null": True},
        }
        result = expr_filter(expr, {}, resolve_identity)
        assert len(result) == 2
        assert [r["job"] for r in result] == ["j1", "j2"]

    def test_filter_non_list_returns_empty(self, resolve_identity):
        expr = {"from": "not a list", "where": {"field": "x", "eq": "y"}}
        result = expr_filter(expr, {}, resolve_identity)
        assert result == []

    def test_filter_no_where_returns_all(self, resolve_identity):
        items = [{"a": 1}, {"a": 2}]
        expr = {"from": items}
        result = expr_filter(expr, {}, resolve_identity)
        assert result == items


class TestExprFilterIn:
    """Tests for the 'in' condition added to expr_filter."""

    def test_filter_in_matches(self, resolve_identity):
        expr = {
            "from": [
                {"uuid": "a", "name": "dataset1"},
                {"uuid": "b", "name": "dataset2"},
                {"uuid": "c", "name": "dataset3"},
            ],
            "where": {"field": "uuid", "in": ["a", "c"]},
        }
        result = expr_filter(expr, {}, resolve_identity)
        assert len(result) == 2
        assert [r["uuid"] for r in result] == ["a", "c"]

    def test_filter_in_no_matches(self, resolve_identity):
        expr = {
            "from": [
                {"uuid": "a", "name": "dataset1"},
                {"uuid": "b", "name": "dataset2"},
            ],
            "where": {"field": "uuid", "in": ["x", "y"]},
        }
        result = expr_filter(expr, {}, resolve_identity)
        assert len(result) == 0

    def test_filter_in_empty_set(self, resolve_identity):
        expr = {
            "from": [{"uuid": "a"}],
            "where": {"field": "uuid", "in": []},
        }
        result = expr_filter(expr, {}, resolve_identity)
        assert len(result) == 0


class TestExprOpsRegistry:
    def test_all_ops_registered(self):
        expected_ops = [
            "any", "concat", "coalesce", "count_where", "filter",
            "get", "len", "eq", "not", "lookup", "unique"
        ]
        for op in expected_ops:
            assert op in EXPR_OPS, f"Missing operator: {op}"

    def test_ops_are_callable(self):
        for name, fn in EXPR_OPS.items():
            assert callable(fn), f"Operator {name} is not callable"


class TestExpressionErrorMessages:
    """Test that expression errors provide helpful context."""

    def test_concat_missing_args_error(self, resolve_identity):
        expr = {}  # Missing 'args'
        with pytest.raises(ExpressionError) as exc_info:
            expr_concat(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "concat"
        assert error.parameter == "args"
        assert "args" in error.message.lower() or "missing" in error.message.lower()

    def test_concat_invalid_args_type_error(self, resolve_identity):
        expr = {"args": "not a list"}
        with pytest.raises(ExpressionError) as exc_info:
            expr_concat(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "concat"
        assert error.expected == "list"
        assert error.received is not None and "str" in error.received

    def test_len_missing_arg_error(self, resolve_identity):
        expr = {}  # Missing 'arg'
        with pytest.raises(ExpressionError) as exc_info:
            expr_len(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "len"
        assert error.parameter is not None and "arg" in error.parameter

    def test_len_invalid_type_error(self, resolve_identity):
        expr = {"arg": 42}  # int has no len
        with pytest.raises(ExpressionError) as exc_info:
            expr_len(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "len"
        assert error.received is not None and "int" in error.received

    def test_eq_missing_left_error(self, resolve_identity):
        expr = {"right": "value"}  # Missing 'left'
        with pytest.raises(ExpressionError) as exc_info:
            expr_eq(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "eq"
        assert error.parameter == "left"

    def test_eq_missing_right_error(self, resolve_identity):
        expr = {"left": "value"}  # Missing 'right'
        with pytest.raises(ExpressionError) as exc_info:
            expr_eq(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "eq"
        assert error.parameter == "right"

    def test_lookup_null_source_error(self, resolve_identity):
        expr = {"from": None, "match": {"field": "id", "equals": "x"}, "select": "name"}
        with pytest.raises(ExpressionError) as exc_info:
            expr_lookup(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "lookup"
        assert "null" in error.message.lower()

    def test_lookup_missing_match_error(self, resolve_identity):
        expr = {"from": [{"id": "a"}], "select": "name"}
        with pytest.raises(ExpressionError) as exc_info:
            expr_lookup(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "lookup"
        assert error.parameter == "match"

    def test_lookup_missing_select_error(self, resolve_identity):
        expr = {"from": [{"id": "a"}], "match": {"field": "id", "equals": "a"}}
        with pytest.raises(ExpressionError) as exc_info:
            expr_lookup(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "lookup"
        assert error.parameter == "select"

    def test_lookup_no_match_includes_search_info(self, resolve_identity):
        expr = {
            "from": [{"id": "a"}, {"id": "b"}],
            "match": {"field": "id", "equals": "z"},
            "select": "name",
        }
        with pytest.raises(ExpressionError) as exc_info:
            expr_lookup(expr, {}, resolve_identity)
        error = exc_info.value
        assert "no match" in error.message.lower()
        assert error.hint is not None and "2 items" in error.hint  # Should mention search count

    def test_filter_missing_field_error(self, resolve_identity):
        expr = {"from": [{"a": 1}], "where": {"eq": "value"}}  # Missing 'field'
        with pytest.raises(ExpressionError) as exc_info:
            expr_filter(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "filter"
        assert error.parameter is not None and "field" in error.parameter

    def test_filter_invalid_comparison_error(self, resolve_identity):
        expr = {"from": [{"a": 1}], "where": {"field": "a", "invalid_op": "x"}}
        with pytest.raises(ExpressionError) as exc_info:
            expr_filter(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "filter"
        assert (error.expected is not None and "eq" in error.expected) or "comparison" in error.message.lower()

    def test_count_where_missing_field_error(self, resolve_identity):
        expr = {"from": [{"a": 1}], "equals": "value"}  # Missing 'field'
        with pytest.raises(ExpressionError) as exc_info:
            expr_count_where(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "count_where"
        assert error.parameter == "field"

    def test_any_missing_field_error(self, resolve_identity):
        expr = {"from": [{"a": 1}], "equals": "value"}  # Missing 'field'
        with pytest.raises(ExpressionError) as exc_info:
            expr_any(expr, {}, resolve_identity)
        error = exc_info.value
        assert error.operator == "any"
        assert error.parameter == "field"

    def test_error_to_dict_includes_context(self, resolve_identity):
        """Test that error serialization includes all context fields."""
        expr = {"args": "not a list"}
        with pytest.raises(ExpressionError) as exc_info:
            expr_concat(expr, {}, resolve_identity)
        error_dict = exc_info.value.to_dict()
        assert "code" in error_dict
        assert "message" in error_dict
        assert "operator" in error_dict
        assert error_dict["operator"] == "concat"
