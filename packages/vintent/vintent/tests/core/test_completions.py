"""Tests for the completions module."""

import json
import logging
import pytest

from vintent.core.completions import get_tool_call, normalize_parameter


class TestGetToolCall:
    def test_returns_none_when_tool_not_found(self):
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {"function": {"name": "other_tool", "arguments": "{}"}}
                        ]
                    }
                }
            ]
        }
        assert get_tool_call("my_tool", reply) is None

    def test_returns_none_when_no_tool_calls(self):
        reply = {"choices": [{"message": {}}]}
        assert get_tool_call("my_tool", reply) is None

    def test_returns_none_when_empty_reply(self):
        assert get_tool_call("my_tool", {}) is None

    def test_returns_parsed_arguments(self):
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "function": {
                                    "name": "my_tool",
                                    "arguments": '{"field": "x", "value": 42}',
                                }
                            }
                        ]
                    }
                }
            ]
        }
        result = get_tool_call("my_tool", reply)
        assert result == {"field": "x", "value": 42}

    def test_merges_multiple_calls_for_same_tool(self):
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {"function": {"name": "my_tool", "arguments": '{"a": 1}'}},
                            {"function": {"name": "my_tool", "arguments": '{"b": 2}'}},
                        ]
                    }
                }
            ]
        }
        result = get_tool_call("my_tool", reply)
        assert result == {"a": 1, "b": 2}

    def test_logs_warning_on_malformed_json(self, caplog):
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "function": {
                                    "name": "my_tool",
                                    "arguments": "not valid json",
                                }
                            }
                        ]
                    }
                }
            ]
        }
        with caplog.at_level(logging.WARNING):
            result = get_tool_call("my_tool", reply)

        # Should return empty dict (found=True but no parsed content)
        assert result == {}

        # Should have logged a warning
        assert len(caplog.records) >= 1
        assert "Failed to parse tool call arguments" in caplog.text
        assert "my_tool" in caplog.text

    def test_returns_partial_results_when_some_calls_fail(self, caplog):
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {"function": {"name": "my_tool", "arguments": '{"a": 1}'}},
                            {
                                "function": {
                                    "name": "my_tool",
                                    "arguments": "bad json",
                                }
                            },
                            {"function": {"name": "my_tool", "arguments": '{"b": 2}'}},
                        ]
                    }
                }
            ]
        }
        with caplog.at_level(logging.WARNING):
            result = get_tool_call("my_tool", reply)

        # Should have parsed the valid calls
        assert result == {"a": 1, "b": 2}

        # Should have logged a warning for the bad one
        assert "Failed to parse tool call arguments" in caplog.text

    def test_truncates_long_arguments_in_log(self, caplog):
        long_args = "x" * 500
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {"function": {"name": "my_tool", "arguments": long_args}}
                        ]
                    }
                }
            ]
        }
        with caplog.at_level(logging.WARNING):
            get_tool_call("my_tool", reply)

        # Should truncate to 200 chars + "..."
        assert "..." in caplog.text
        # The full 500 chars should not be in the warning message
        assert long_args not in caplog.text


class TestNormalizeParameter:
    def test_returns_fallback_when_none(self):
        assert normalize_parameter(None, 0, 100, 50) == 50

    def test_returns_value_when_in_range(self):
        assert normalize_parameter(42, 0, 100, 50) == 42

    def test_clamps_to_min(self):
        assert normalize_parameter(-5, 0, 100, 50) == 0

    def test_clamps_to_max(self):
        assert normalize_parameter(150, 0, 100, 50) == 100

    def test_boundary_min(self):
        assert normalize_parameter(0, 0, 100, 50) == 0

    def test_boundary_max(self):
        assert normalize_parameter(100, 0, 100, 50) == 100
