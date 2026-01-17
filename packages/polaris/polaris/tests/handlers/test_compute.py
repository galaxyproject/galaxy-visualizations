"""Tests for ComputeHandler."""

import pytest

from polaris.modules.handlers import ComputeHandler

from .mocks import MockRegistry, MockRunner


class TestComputeHandler:
    @pytest.mark.asyncio
    async def test_execute_returns_ok(self, mock_context):
        handler = ComputeHandler()
        runner = MockRunner()
        node = {"type": "compute", "emit": {"state.value": "result"}}

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is True
        assert result["result"] is None
        assert mock_context["result"] is None

    @pytest.mark.asyncio
    async def test_execute_applies_emit(self, mock_context):
        handler = ComputeHandler()
        runner = MockRunner()
        node = {"type": "compute", "emit": {"state.computed": "result"}}

        await handler.execute(node, mock_context, MockRegistry(), runner)

        assert len(runner.emitted) == 1
