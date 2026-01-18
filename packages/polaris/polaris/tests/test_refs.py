"""Tests for refs module."""

import logging

import pytest

from polaris.modules.refs import VALID_NAMESPACES, get_path


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


class TestInvalidNamespace:
    """Tests for invalid namespace handling."""

    def test_invalid_namespace_returns_none(self):
        """Invalid namespace returns None."""
        state = {}
        ctx = {}
        assert get_path("truncated", ctx, state) is None
        assert get_path("unknown.path", ctx, state) is None

    def test_invalid_namespace_logs_warning(self, caplog):
        """Invalid namespace logs a warning to help debugging."""
        state = {}
        ctx = {}
        with caplog.at_level(logging.WARNING):
            result = get_path("truncated", ctx, state)

        assert result is None
        assert len(caplog.records) == 1
        assert "Invalid $ref namespace 'truncated'" in caplog.text
        assert "Valid namespaces:" in caplog.text

    def test_invalid_namespace_warning_includes_valid_options(self, caplog):
        """Warning message lists valid namespace options."""
        state = {}
        ctx = {}
        with caplog.at_level(logging.WARNING):
            get_path("foobar.something", ctx, state)

        # Check all valid namespaces are mentioned
        for ns in VALID_NAMESPACES:
            assert ns in caplog.text

    def test_valid_namespaces_do_not_warn(self, caplog):
        """Valid namespaces do not trigger warning even if path doesn't exist."""
        state = {}
        ctx = {}
        with caplog.at_level(logging.WARNING):
            # These should not warn - they're valid namespaces, just missing data
            get_path("state.missing", ctx, state)
            get_path("inputs.missing", ctx, state)
            get_path("result.missing", ctx, state)
            get_path("run.missing", ctx, state)
            get_path("loop.missing", ctx, state)

        assert len(caplog.records) == 0

    def test_valid_namespaces_constant(self):
        """VALID_NAMESPACES contains expected values."""
        expected = {"state", "inputs", "run", "result", "loop"}
        assert VALID_NAMESPACES == expected
