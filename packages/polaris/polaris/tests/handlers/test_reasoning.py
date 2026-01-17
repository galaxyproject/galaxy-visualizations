"""Tests for ReasoningHandler."""

import pytest

from polaris.modules.handlers import ReasoningHandler

from .mocks import MockRegistry, MockRunner


class TestReasoningHandler:
    @pytest.mark.asyncio
    async def test_execute_calls_reason(self, mock_context):
        handler = ReasoningHandler()
        runner = MockRunner()
        registry = MockRegistry()
        node = {
            "type": "reasoning",
            "prompt": "Analyze this",
            "input": {"data": "test"},
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        assert result["result"] == "reasoning output"
