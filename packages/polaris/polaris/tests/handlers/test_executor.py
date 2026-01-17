"""Tests for ExecutorHandler."""

import pytest

from polaris.modules.constants import ErrorCode, Operation
from polaris.modules.handlers import ExecutorHandler

from .mocks import MockRegistry, MockRunner


class TestExecutorHandler:
    @pytest.mark.asyncio
    async def test_api_call_success(self, mock_context):
        handler = ExecutorHandler()
        runner = MockRunner()
        registry = MockRegistry()
        node = {
            "type": "executor",
            "run": {
                "op": Operation.API_CALL,
                "target": "test.endpoint",
                "input": {"param": "value"},
            },
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        assert result["result"]["data"] == "test"

    @pytest.mark.asyncio
    async def test_api_call_applies_emit(self, mock_context):
        handler = ExecutorHandler()
        runner = MockRunner()
        registry = MockRegistry()
        node = {
            "type": "executor",
            "run": {"op": Operation.API_CALL, "target": "test.endpoint"},
            "emit": {"state.data": "result"},
        }

        await handler.execute(node, mock_context, registry, runner)

        assert len(runner.emitted) == 1

    @pytest.mark.asyncio
    async def test_unknown_op_returns_error(self, mock_context):
        handler = ExecutorHandler()
        runner = MockRunner()
        node = {
            "type": "executor",
            "run": {"op": "unknown.operation"},
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.UNKNOWN_EXECUTOR_OP
