"""Tests for TerminalHandler."""

import pytest

from polaris.modules.handlers import TerminalHandler

from .mocks import MockRegistry, MockRunner


class TestTerminalHandler:
    @pytest.mark.asyncio
    async def test_execute_sets_output(self, mock_context):
        handler = TerminalHandler()
        runner = MockRunner()
        node = {
            "type": "terminal",
            "output": {"message": "done"},
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is True
        assert runner.state["output"]["message"] == "done"

    @pytest.mark.asyncio
    async def test_execute_no_output(self, mock_context):
        handler = TerminalHandler()
        runner = MockRunner()
        node = {"type": "terminal"}

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is True
        assert result["result"] is None
