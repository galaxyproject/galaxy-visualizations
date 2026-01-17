"""Tests for PlannerHandler."""

import pytest

from polaris.modules.handlers import PlannerHandler

from .mocks import MockRegistry, MockRunner


class TestPlannerHandler:
    @pytest.mark.asyncio
    async def test_execute_calls_plan(self, mock_context):
        handler = PlannerHandler()
        runner = MockRunner()
        registry = MockRegistry()
        node = {
            "type": "planner",
            "prompt": "Test prompt",
            "tools": [],
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        assert result["result"]["next"] == "end"

    @pytest.mark.asyncio
    async def test_execute_applies_emit(self, mock_context):
        handler = PlannerHandler()
        runner = MockRunner()
        registry = MockRegistry()
        node = {
            "type": "planner",
            "emit": {"state.plan": "result"},
        }

        await handler.execute(node, mock_context, registry, runner)

        assert len(runner.emitted) == 1
