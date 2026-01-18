"""Tests for the Resolver class."""

import pytest

from polaris.modules.constants import ControlOp
from polaris.modules.exceptions import ExpressionError
from polaris.modules.resolver import Resolver


class TestResolverResolve:
    """Tests for Resolver.resolve method."""

    def test_resolve_literal_string(self):
        resolver = Resolver({})
        result = resolver.resolve("hello", {})
        assert result == "hello"

    def test_resolve_literal_number(self):
        resolver = Resolver({})
        result = resolver.resolve(42, {})
        assert result == 42

    def test_resolve_literal_none(self):
        resolver = Resolver({})
        result = resolver.resolve(None, {})
        assert result is None

    def test_resolve_ref_from_state(self):
        state = {"name": "test"}
        resolver = Resolver(state)
        result = resolver.resolve({"$ref": "state.name"}, {"state": state})
        assert result == "test"

    def test_resolve_ref_from_inputs(self):
        state = {"inputs": {"id": "123"}}
        resolver = Resolver(state)
        ctx = {"inputs": state["inputs"], "state": state}
        result = resolver.resolve({"$ref": "inputs.id"}, ctx)
        assert result == "123"

    def test_resolve_nested_ref(self):
        state = {"data": {"nested": {"value": "deep"}}}
        resolver = Resolver(state)
        ctx = {"state": state}
        result = resolver.resolve({"$ref": "state.data.nested.value"}, ctx)
        assert result == "deep"

    def test_resolve_expr(self):
        state = {"items": [1, 2, 3]}
        resolver = Resolver(state)
        ctx = {"state": state}
        result = resolver.resolve({"$expr": {"op": "len", "arg": {"$ref": "state.items"}}}, ctx)
        assert result == 3

    def test_resolve_dict_recursively(self):
        state = {"name": "Alice", "age": 30}
        resolver = Resolver(state)
        ctx = {"state": state}
        result = resolver.resolve(
            {"user": {"$ref": "state.name"}, "years": {"$ref": "state.age"}},
            ctx
        )
        assert result == {"user": "Alice", "years": 30}

    def test_resolve_list_recursively(self):
        state = {"a": 1, "b": 2}
        resolver = Resolver(state)
        ctx = {"state": state}
        result = resolver.resolve([{"$ref": "state.a"}, {"$ref": "state.b"}], ctx)
        assert result == [1, 2]


class TestResolverEvalExpr:
    """Tests for Resolver.eval_expr method."""

    def test_eval_concat(self):
        resolver = Resolver({})
        result = resolver.eval_expr({"op": "concat", "args": ["Hello, ", "World!"]}, {})
        assert result == "Hello, World!"

    def test_eval_len(self):
        state = {"items": ["a", "b", "c"]}
        resolver = Resolver(state)
        ctx = {"state": state}
        result = resolver.eval_expr({"op": "len", "arg": {"$ref": "state.items"}}, ctx)
        assert result == 3

    def test_eval_eq_true(self):
        resolver = Resolver({})
        result = resolver.eval_expr({"op": "eq", "left": 5, "right": 5}, {})
        assert result is True

    def test_eval_eq_false(self):
        resolver = Resolver({})
        result = resolver.eval_expr({"op": "eq", "left": 5, "right": 10}, {})
        assert result is False

    def test_eval_not(self):
        resolver = Resolver({})
        result = resolver.eval_expr({"op": "not", "arg": False}, {})
        assert result is True

    def test_eval_coalesce(self):
        resolver = Resolver({})
        result = resolver.eval_expr({"op": "coalesce", "args": [None, None, "default"]}, {})
        assert result == "default"

    def test_eval_unknown_operator_raises(self):
        resolver = Resolver({})
        with pytest.raises(ExpressionError) as exc_info:
            resolver.eval_expr({"op": "unknown_op"}, {})
        assert "Unknown expression operator" in str(exc_info.value)
        assert "unknown_op" in str(exc_info.value)


class TestResolverEvalBranch:
    """Tests for Resolver.eval_branch method."""

    def test_eval_branch_match_first_case(self):
        state = {"status": "active"}
        resolver = Resolver(state)
        ctx = {"state": state}
        condition = {
            "op": ControlOp.BRANCH,
            "cases": [
                {"when": {"state.status": "active"}, "next": "process"},
                {"when": {"state.status": "inactive"}, "next": "skip"},
            ],
            "default": "error",
        }
        result = resolver.eval_branch(condition, ctx)
        assert result == {"next": "process"}

    def test_eval_branch_match_second_case(self):
        state = {"status": "inactive"}
        resolver = Resolver(state)
        ctx = {"state": state}
        condition = {
            "op": ControlOp.BRANCH,
            "cases": [
                {"when": {"state.status": "active"}, "next": "process"},
                {"when": {"state.status": "inactive"}, "next": "skip"},
            ],
            "default": "error",
        }
        result = resolver.eval_branch(condition, ctx)
        assert result == {"next": "skip"}

    def test_eval_branch_falls_through_to_default(self):
        state = {"status": "unknown"}
        resolver = Resolver(state)
        ctx = {"state": state}
        condition = {
            "op": ControlOp.BRANCH,
            "cases": [
                {"when": {"state.status": "active"}, "next": "process"},
            ],
            "default": "fallback",
        }
        result = resolver.eval_branch(condition, ctx)
        assert result == {"next": "fallback"}

    def test_eval_branch_no_condition_returns_none(self):
        resolver = Resolver({})
        result = resolver.eval_branch(None, {})
        assert result == {"next": None}

    def test_eval_branch_multi_condition_match(self):
        state = {"type": "premium", "active": True}
        resolver = Resolver(state)
        ctx = {"state": state}
        condition = {
            "op": ControlOp.BRANCH,
            "cases": [
                {"when": {"state.type": "premium", "state.active": True}, "next": "premium_active"},
            ],
            "default": "other",
        }
        result = resolver.eval_branch(condition, ctx)
        assert result == {"next": "premium_active"}

    def test_eval_branch_multi_condition_partial_match_fails(self):
        state = {"type": "premium", "active": False}
        resolver = Resolver(state)
        ctx = {"state": state}
        condition = {
            "op": ControlOp.BRANCH,
            "cases": [
                {"when": {"state.type": "premium", "state.active": True}, "next": "premium_active"},
            ],
            "default": "other",
        }
        result = resolver.eval_branch(condition, ctx)
        assert result == {"next": "other"}


class TestResolverApplyEmit:
    """Tests for Resolver.apply_emit method."""

    def test_apply_emit_from_payload_field(self):
        state = {}
        resolver = Resolver(state)
        emit = {"state.result": "data"}
        payload = {"data": {"value": 42}}
        resolver.apply_emit(emit, payload, {})
        assert state["result"] == {"value": 42}

    def test_apply_emit_with_ref(self):
        state = {"source": "original"}
        resolver = Resolver(state)
        ctx = {"state": state}
        emit = {"state.copy": {"$ref": "state.source"}}
        payload = {"result": "unused"}
        resolver.apply_emit(emit, payload, ctx)
        assert state["copy"] == "original"

    def test_apply_emit_with_expr(self):
        state = {"items": [1, 2, 3, 4, 5]}
        resolver = Resolver(state)
        ctx = {"state": state}
        emit = {"state.count": {"$expr": {"op": "len", "arg": {"$ref": "state.items"}}}}
        payload = {"result": "unused"}
        resolver.apply_emit(emit, payload, ctx)
        assert state["count"] == 5

    def test_apply_emit_literal_value(self):
        state = {}
        resolver = Resolver(state)
        emit = {"state.flag": True}
        payload = {"result": "unused"}
        resolver.apply_emit(emit, payload, {})
        assert state["flag"] is True

    def test_apply_emit_strips_state_prefix(self):
        state = {}
        resolver = Resolver(state)
        emit = {"state.key": "value"}
        payload = {"value": "test"}
        resolver.apply_emit(emit, payload, {})
        assert "key" in state
        assert "state.key" not in state

    def test_apply_emit_without_state_prefix(self):
        state = {}
        resolver = Resolver(state)
        emit = {"key": "value"}
        payload = {"value": "test"}
        resolver.apply_emit(emit, payload, {})
        assert state["key"] == "test"

    def test_apply_emit_none_emit_is_noop(self):
        state = {"existing": "value"}
        resolver = Resolver(state)
        resolver.apply_emit(None, {"data": 123}, {})
        assert state == {"existing": "value"}

    def test_apply_emit_none_payload_is_noop(self):
        state = {"existing": "value"}
        resolver = Resolver(state)
        resolver.apply_emit({"state.new": "data"}, None, {})
        assert state == {"existing": "value"}

    def test_apply_emit_direct_string_for_top_level_field(self):
        """Direct string reference extracts top-level field from payload.

        This is the pattern used for truncated flag:
        emit:
          state.truncated: truncated  # Direct string, not $ref
        """
        state = {}
        resolver = Resolver(state)
        emit = {"state.truncated": "truncated"}
        payload = {"result": {"data": "value"}, "truncated": True}
        resolver.apply_emit(emit, payload, {})
        assert state["truncated"] is True

    def test_apply_emit_direct_string_for_missing_field_returns_none(self):
        """Direct string reference returns None for missing field."""
        state = {}
        resolver = Resolver(state)
        emit = {"state.truncated": "truncated"}
        payload = {"result": {"data": "value"}}  # No truncated field
        resolver.apply_emit(emit, payload, {})
        assert state["truncated"] is None

    def test_apply_emit_ref_invalid_namespace_returns_none(self):
        """$ref with invalid namespace returns None.

        This test documents why we use direct string reference instead of $ref
        for top-level payload fields like 'truncated'.
        """
        state = {}
        resolver = Resolver(state)
        ctx = {"state": state}
        # This pattern does NOT work - 'truncated' is not a valid namespace
        emit = {"state.truncated": {"$ref": "truncated"}}
        payload = {"result": {"data": "value"}, "truncated": True}
        resolver.apply_emit(emit, payload, ctx)
        # Returns None because 'truncated' isn't a valid root namespace
        assert state["truncated"] is None

    def test_apply_emit_multiple_fields_from_payload(self):
        """Multiple fields can be extracted from payload."""
        state = {}
        resolver = Resolver(state)
        emit = {
            "state.data": "result",
            "state.truncated": "truncated",
            "state.ok": "ok",
        }
        payload = {
            "ok": True,
            "result": {"items": [1, 2, 3]},
            "truncated": False,
        }
        resolver.apply_emit(emit, payload, {})
        assert state["data"] == {"items": [1, 2, 3]}
        assert state["truncated"] is False
        assert state["ok"] is True
