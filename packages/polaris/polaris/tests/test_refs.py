"""Tests for refs module."""

from polaris.modules.refs import get_path


class TestGetPath:
    def test_get_state_path(self):
        state = {"count": 42, "nested": {"value": "deep"}}
        ctx = {}
        assert get_path("state.count", ctx, state) == 42
        assert get_path("state.nested.value", ctx, state) == "deep"

    def test_get_inputs_path(self):
        state = {"inputs": {"name": "test", "data": {"id": 123}}}
        ctx = {}
        assert get_path("inputs.name", ctx, state) == "test"
        assert get_path("inputs.data.id", ctx, state) == 123

    def test_get_run_path(self):
        state = {}
        ctx = {"run": {"input": {"param": "value"}}}
        assert get_path("run.input.param", ctx, state) == "value"

    def test_get_result_path(self):
        state = {}
        ctx = {"result": {"status": "ok", "data": {"items": [1, 2]}}}
        assert get_path("result.status", ctx, state) == "ok"
        assert get_path("result.data.items", ctx, state) == [1, 2]

    def test_missing_root_returns_none(self):
        state = {}
        ctx = {}
        assert get_path("unknown.path", ctx, state) is None

    def test_missing_nested_path_returns_none(self):
        state = {"exists": {}}
        ctx = {}
        assert get_path("state.exists.missing.deep", ctx, state) is None

    def test_state_root_only(self):
        state = {"key": "value"}
        ctx = {}
        result = get_path("state", ctx, state)
        assert result == state

    def test_non_dict_traversal_returns_none(self):
        state = {"scalar": "string_value"}
        ctx = {}
        assert get_path("state.scalar.nested", ctx, state) is None
