"""Tests for PlannerHandler."""

import json

import pytest

from polaris.modules.constants import ErrorCode
from polaris.modules.handlers import PlannerHandler

from .mocks import MockRegistry, MockRunner


class TestPlannerHandlerRouteMode:
    """Tests for route mode planner."""

    @pytest.mark.asyncio
    async def test_execute_route_mode_success(self, mock_context):
        """Test successful route mode execution."""
        handler = PlannerHandler()
        runner = MockRunner()
        registry = MockRegistry()
        registry.reason_structured_result = '{"route": "process"}'

        node = {
            "type": "planner",
            "output_mode": "route",
            "prompt": "Decide the next step",
            "routes": {
                "process": {"description": "Continue processing", "next": "process_node"},
                "skip": {"description": "Skip to end", "next": "done"},
            },
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        assert result["result"] == {"route": "process"}

    @pytest.mark.asyncio
    async def test_execute_route_mode_invalid_route(self, mock_context):
        """Test route mode with invalid route value."""
        handler = PlannerHandler()
        runner = MockRunner()
        registry = MockRegistry()
        registry.reason_structured_result = '{"route": "invalid"}'

        node = {
            "type": "planner",
            "output_mode": "route",
            "prompt": "Decide",
            "routes": {
                "process": {"description": "Process", "next": "process_node"},
            },
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.PLANNER_SCHEMA_VALIDATION_FAILED

    @pytest.mark.asyncio
    async def test_execute_route_mode_applies_emit(self, mock_context):
        """Test that emit rules are applied in route mode."""
        handler = PlannerHandler()
        runner = MockRunner()
        registry = MockRegistry()
        registry.reason_structured_result = '{"route": "process"}'

        node = {
            "type": "planner",
            "output_mode": "route",
            "prompt": "Decide",
            "routes": {
                "process": {"description": "Process", "next": "process_node"},
            },
            "emit": {"state.decision": {"$ref": "result.route"}},
        }

        await handler.execute(node, mock_context, registry, runner)

        assert len(runner.emitted) == 1


class TestPlannerHandlerJsonMode:
    """Tests for JSON mode planner."""

    @pytest.mark.asyncio
    async def test_execute_json_mode_success(self, mock_context):
        """Test successful JSON mode execution."""
        handler = PlannerHandler()
        runner = MockRunner()
        registry = MockRegistry()
        registry.reason_structured_result = '{"threshold": 0.5, "columns": ["a", "b"]}'

        node = {
            "type": "planner",
            "output_mode": "json",
            "prompt": "Extract parameters",
            "output_schema": {
                "type": "object",
                "required": ["threshold", "columns"],
                "properties": {
                    "threshold": {"type": "number"},
                    "columns": {"type": "array", "items": {"type": "string"}},
                },
            },
            "next": "process_node",
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        assert result["result"]["threshold"] == 0.5
        assert result["result"]["columns"] == ["a", "b"]

    @pytest.mark.asyncio
    async def test_execute_json_mode_schema_violation(self, mock_context):
        """Test JSON mode with schema violation."""
        handler = PlannerHandler()
        runner = MockRunner()
        registry = MockRegistry()
        registry.reason_structured_result = '{"threshold": "not a number"}'

        node = {
            "type": "planner",
            "output_mode": "json",
            "prompt": "Extract",
            "output_schema": {
                "type": "object",
                "required": ["threshold"],
                "properties": {"threshold": {"type": "number"}},
            },
            "next": "process_node",
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.PLANNER_SCHEMA_VALIDATION_FAILED

    @pytest.mark.asyncio
    async def test_execute_json_mode_invalid_json(self, mock_context):
        """Test JSON mode with invalid JSON response."""
        handler = PlannerHandler()
        runner = MockRunner()
        registry = MockRegistry()
        registry.reason_structured_result = "not valid json"

        node = {
            "type": "planner",
            "output_mode": "json",
            "prompt": "Extract",
            "output_schema": {"type": "object"},
            "next": "process_node",
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.PLANNER_INVALID_JSON

    @pytest.mark.asyncio
    async def test_execute_json_mode_sets_context(self, mock_context):
        """Test that result is set in context."""
        handler = PlannerHandler()
        runner = MockRunner()
        registry = MockRegistry()
        registry.reason_structured_result = '{"value": 42}'

        node = {
            "type": "planner",
            "output_mode": "json",
            "prompt": "Extract",
            "output_schema": {
                "type": "object",
                "properties": {"value": {"type": "number"}},
            },
            "next": "process_node",
        }

        await handler.execute(node, mock_context, registry, runner)

        assert mock_context["result"] == {"value": 42}

    @pytest.mark.asyncio
    async def test_execute_with_input_context(self, mock_context):
        """Test that input is resolved and passed to prompt."""
        handler = PlannerHandler()
        runner = MockRunner()
        registry = MockRegistry()
        registry.reason_structured_result = '{"route": "process"}'

        mock_context["state"]["data"] = {"key": "value"}

        node = {
            "type": "planner",
            "output_mode": "route",
            "prompt": "Analyze data",
            "input": {"data": {"$ref": "state.data"}},
            "routes": {
                "process": {"description": "Process", "next": "process_node"},
            },
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
