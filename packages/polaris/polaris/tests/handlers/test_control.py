"""Tests for ControlHandler."""

import pytest

from polaris.modules.handlers import ControlHandler

from .mocks import MockRegistry, MockRunner


class TestControlHandler:
    @pytest.mark.asyncio
    async def test_execute_evaluates_branch(self, mock_context):
        handler = ControlHandler()
        runner = MockRunner()
        node = {"type": "control", "condition": {"op": "control.branch"}}

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is True
        assert result["result"]["next"] == "branch_target"
