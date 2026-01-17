"""Tests for the completions module."""

import pytest

from polaris.core.completions import get_tool_call


class TestGetToolCall:
    """Tests for get_tool_call function."""

    def test_returns_none_when_no_tool_calls(self):
        """Returns None when response has no tool calls."""
        reply = {"choices": [{"message": {}}]}
        result = get_tool_call("my_tool", reply)
        assert result is None

    def test_returns_none_when_tool_not_found(self):
        """Returns None when the named tool is not in the response."""
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {"function": {"name": "other_tool", "arguments": '{"key": "value"}'}}
                        ]
                    }
                }
            ]
        }
        result = get_tool_call("my_tool", reply)
        assert result is None

    def test_returns_parsed_arguments(self):
        """Returns parsed arguments when tool is found."""
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {"function": {"name": "my_tool", "arguments": '{"key": "value", "num": 42}'}}
                        ]
                    }
                }
            ]
        }
        result = get_tool_call("my_tool", reply)
        assert result == {"key": "value", "num": 42}

    def test_returns_empty_dict_when_no_arguments(self):
        """Returns empty dict when tool is found but has no arguments."""
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [{"function": {"name": "my_tool", "arguments": ""}}]
                    }
                }
            ]
        }
        result = get_tool_call("my_tool", reply)
        assert result == {}

    def test_raises_valueerror_on_malformed_json(self):
        """Raises ValueError when tool arguments are malformed JSON."""
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {"function": {"name": "my_tool", "arguments": "{invalid json}"}}
                        ]
                    }
                }
            ]
        }
        with pytest.raises(ValueError, match="Malformed tool call arguments for 'my_tool'"):
            get_tool_call("my_tool", reply)

    def test_valueerror_includes_truncated_args(self):
        """ValueError message includes truncated raw arguments."""
        long_invalid_json = '{"unclosed": "' + "x" * 300
        reply = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [{"function": {"name": "my_tool", "arguments": long_invalid_json}}]
                    }
                }
            ]
        }
        with pytest.raises(ValueError, match=r"Raw arguments: .{0,210}\.\.\."):
            get_tool_call("my_tool", reply)

    def test_merges_multiple_calls_same_tool(self):
        """Merges arguments from multiple calls to the same tool."""
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

    def test_handles_empty_choices(self):
        """Returns None when choices array is empty."""
        reply = {"choices": []}
        result = get_tool_call("my_tool", reply)
        assert result is None

    def test_handles_missing_choices(self):
        """Returns None when choices key is missing."""
        reply = {}
        result = get_tool_call("my_tool", reply)
        assert result is None
