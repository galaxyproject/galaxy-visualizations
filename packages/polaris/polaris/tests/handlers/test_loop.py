"""Tests for LoopHandler."""

import asyncio

import pytest

from polaris.modules.constants import ErrorCode, Operation
from polaris.modules.handlers import LoopHandler

from .mocks import MockLoopRunner, MockRegistry


class TestLoopHandler:
    @pytest.mark.asyncio
    async def test_loop_over_array(self, mock_context):
        """Test basic loop iteration over an array."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()
        node = {
            "type": "loop",
            "over": [{"id": 1}, {"id": 2}, {"id": 3}],
            "as": "item",
            "execute": {
                "op": Operation.API_CALL,
                "target": "test.endpoint",
                "input": {"item_id": "test"},
            },
            "emit": {
                "state.results": {"$append": "result"},
            },
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        assert len(result["result"]) == 3
        assert runner.state["results"] == [{"data": "test"}] * 3

    @pytest.mark.asyncio
    async def test_loop_with_ref_resolution(self, mock_context):
        """Test loop resolves $ref for over array."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        runner.state["items"] = [{"id": "a"}, {"id": "b"}]
        registry = MockRegistry()
        node = {
            "type": "loop",
            "over": {"$ref": "state.items"},
            "as": "item",
            "execute": {
                "op": Operation.API_CALL,
                "target": "test.endpoint",
            },
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        assert len(result["result"]) == 2

    @pytest.mark.asyncio
    async def test_loop_context_available(self, mock_context):
        """Test loop context variables are available during iteration."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()
        captured_contexts = []

        async def capture_call_api(ctx, spec):
            captured_contexts.append({
                "loop": ctx.get("loop", {}).copy() if ctx.get("loop") else None,
            })
            return {"ok": True, "result": {"data": "test"}}

        registry.call_api = capture_call_api

        node = {
            "type": "loop",
            "over": [{"name": "first"}, {"name": "second"}],
            "as": "job",
            "execute": {
                "op": Operation.API_CALL,
                "target": "test.endpoint",
            },
        }

        await handler.execute(node, mock_context, registry, runner)

        assert len(captured_contexts) == 2
        assert captured_contexts[0]["loop"]["job"] == {"name": "first"}
        assert captured_contexts[0]["loop"]["index"] == 0
        assert captured_contexts[0]["loop"]["first"] is True
        assert captured_contexts[0]["loop"]["last"] is False
        assert captured_contexts[1]["loop"]["job"] == {"name": "second"}
        assert captured_contexts[1]["loop"]["index"] == 1
        assert captured_contexts[1]["loop"]["first"] is False
        assert captured_contexts[1]["loop"]["last"] is True

    @pytest.mark.asyncio
    async def test_loop_invalid_over_returns_error(self, mock_context):
        """Test loop returns error when over is not a list."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        node = {
            "type": "loop",
            "over": "not a list",
            "execute": {"op": Operation.API_CALL},
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.LOOP_INVALID_OVER

    @pytest.mark.asyncio
    async def test_loop_empty_array(self, mock_context):
        """Test loop handles empty array gracefully."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        node = {
            "type": "loop",
            "over": [],
            "execute": {"op": Operation.API_CALL},
        }

        result = await handler.execute(node, mock_context, MockRegistry(), runner)

        assert result["ok"] is True
        assert result["result"] == []

    @pytest.mark.asyncio
    async def test_loop_iteration_failure_continues_by_default(self, mock_context):
        """Test loop continues on error by default and returns warnings."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()
        registry.call_api_result = {
            "ok": False,
            "error": {"code": "API_ERROR", "message": "Failed"},
        }
        node = {
            "type": "loop",
            "over": [{"id": 1}, {"id": 2}],
            "execute": {"op": Operation.API_CALL, "target": "test.endpoint"},
        }

        result = await handler.execute(node, mock_context, registry, runner)

        # Default on_error: continue - returns ok with warnings
        assert result["ok"] is True
        assert result["result"] == []
        assert result["warnings"]["code"] == ErrorCode.LOOP_ITERATION_FAILED
        assert result["warnings"]["failed_count"] == 2

    @pytest.mark.asyncio
    async def test_loop_iteration_failure_stops_when_configured(self, mock_context):
        """Test loop stops on first error when on_error: stop."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()
        registry.call_api_result = {
            "ok": False,
            "error": {"code": "API_ERROR", "message": "Failed"},
        }
        node = {
            "type": "loop",
            "over": [{"id": 1}, {"id": 2}, {"id": 3}],
            "on_error": "stop",
            "execute": {"op": Operation.API_CALL, "target": "test.endpoint"},
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.LOOP_ITERATION_FAILED
        # Should stop after first error
        assert len(result["error"]["details"]) == 1

    @pytest.mark.asyncio
    async def test_loop_cleans_up_context(self, mock_context):
        """Test loop context is cleaned up after execution."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()
        node = {
            "type": "loop",
            "over": [{"id": 1}],
            "execute": {"op": Operation.API_CALL},
        }

        await handler.execute(node, mock_context, registry, runner)

        assert "loop" not in mock_context

    @pytest.mark.asyncio
    async def test_loop_emit_field_selection(self, mock_context):
        """Test loop emit with field selection from result."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()

        # API returns full objects but we only want specific fields
        api_results = [
            {"id": "a", "name": "First", "details": {"large": "data"}, "extra": 123},
            {"id": "b", "name": "Second", "details": {"large": "data"}, "extra": 456},
        ]
        call_count = [0]

        async def mock_call_api(ctx, spec):
            result = api_results[call_count[0]]
            call_count[0] += 1
            return {"ok": True, "result": result}

        registry.call_api = mock_call_api

        node = {
            "type": "loop",
            "over": [{"item_id": "a"}, {"item_id": "b"}],
            "as": "item",
            "execute": {
                "op": Operation.API_CALL,
                "target": "test.endpoint",
            },
            "emit": {
                "state.selected": {
                    "$append": {
                        "id": {"$ref": "result.id"},
                        "name": {"$ref": "result.name"},
                    }
                }
            },
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        # Verify only selected fields were captured
        assert runner.state["selected"] == [
            {"id": "a", "name": "First"},
            {"id": "b", "name": "Second"},
        ]

    @pytest.mark.asyncio
    async def test_loop_concurrent_execution(self, mock_context):
        """Test loop executes concurrently when concurrency > 1."""
        import time

        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()

        call_times: list[float] = []

        async def mock_call_api(ctx, spec):
            call_times.append(time.time())
            await asyncio.sleep(0.05)  # Simulate API latency
            return {"ok": True, "result": {"data": "test"}}

        registry.call_api = mock_call_api

        node = {
            "type": "loop",
            "over": [{"id": 1}, {"id": 2}, {"id": 3}, {"id": 4}],
            "concurrency": 4,  # All at once
            "execute": {"op": Operation.API_CALL, "target": "test.endpoint"},
        }

        start = time.time()
        result = await handler.execute(node, mock_context, registry, runner)
        elapsed = time.time() - start

        assert result["ok"] is True
        assert len(result["result"]) == 4
        # With concurrency=4, all should start nearly simultaneously
        # Total time should be ~0.05s (one batch) not ~0.2s (sequential)
        assert elapsed < 0.15  # Allow some overhead

    @pytest.mark.asyncio
    async def test_loop_concurrent_preserves_order(self, mock_context):
        """Test concurrent loop preserves result order."""
        import random

        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()

        async def mock_call_api(ctx, spec):
            # Random delay to simulate variable API response times
            await asyncio.sleep(random.uniform(0.01, 0.05))
            # Return the loop index to verify order
            loop_ctx = ctx.get("loop", {})
            return {"ok": True, "result": {"index": loop_ctx.get("index")}}

        registry.call_api = mock_call_api

        node = {
            "type": "loop",
            "over": [{"id": "a"}, {"id": "b"}, {"id": "c"}, {"id": "d"}, {"id": "e"}],
            "concurrency": 5,
            "execute": {"op": Operation.API_CALL, "target": "test.endpoint"},
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        # Results should be in order despite random completion times
        indices = [r["index"] for r in result["result"]]
        assert indices == [0, 1, 2, 3, 4]

    @pytest.mark.asyncio
    async def test_loop_concurrent_with_semaphore_limit(self, mock_context):
        """Test concurrent loop respects semaphore limit."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()

        concurrent_count = [0]
        max_concurrent = [0]

        async def mock_call_api(ctx, spec):
            concurrent_count[0] += 1
            max_concurrent[0] = max(max_concurrent[0], concurrent_count[0])
            await asyncio.sleep(0.02)
            concurrent_count[0] -= 1
            return {"ok": True, "result": {"data": "test"}}

        registry.call_api = mock_call_api

        node = {
            "type": "loop",
            "over": [{"id": i} for i in range(10)],
            "concurrency": 3,  # Limit to 3 concurrent
            "execute": {"op": Operation.API_CALL, "target": "test.endpoint"},
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        assert len(result["result"]) == 10
        # Max concurrent should not exceed semaphore limit
        assert max_concurrent[0] <= 3

    @pytest.mark.asyncio
    async def test_loop_concurrent_with_errors(self, mock_context):
        """Test concurrent loop handles errors correctly."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()

        async def mock_call_api(ctx, spec):
            loop_ctx = ctx.get("loop", {})
            index = loop_ctx.get("index", 0)
            if index == 2:  # Fail on third item
                return {"ok": False, "error": {"code": "API_ERROR", "message": "Failed"}}
            return {"ok": True, "result": {"index": index}}

        registry.call_api = mock_call_api

        node = {
            "type": "loop",
            "over": [{"id": i} for i in range(5)],
            "concurrency": 5,
            "execute": {"op": Operation.API_CALL, "target": "test.endpoint"},
        }

        result = await handler.execute(node, mock_context, registry, runner)

        # Default on_error: continue - returns ok with warnings
        assert result["ok"] is True
        assert len(result["result"]) == 4  # 5 - 1 error
        assert result["warnings"]["failed_count"] == 1

    @pytest.mark.asyncio
    async def test_loop_when_condition_filters_iterations(self, mock_context):
        """Test loop when condition filters iterations."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()

        node = {
            "type": "loop",
            "over": [
                {"id": 1, "state": "ok"},
                {"id": 2, "state": "error"},
                {"id": 3, "state": "ok"},
                {"id": 4, "state": "pending"},
                {"id": 5, "state": "ok"},
            ],
            "as": "item",
            "when": {"$ref": "loop.item.state", "$eq": "ok"},
            "execute": {"op": Operation.API_CALL, "target": "test.endpoint"},
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        # Only 3 items have state="ok", others should be skipped
        assert len(result["result"]) == 3
        # Verify skipped count is tracked
        assert result["warnings"]["skipped_count"] == 2

    @pytest.mark.asyncio
    async def test_loop_when_condition_concurrent(self, mock_context):
        """Test loop when condition works with concurrent execution."""
        handler = LoopHandler()
        runner = MockLoopRunner()
        registry = MockRegistry()

        node = {
            "type": "loop",
            "over": [
                {"id": 1, "state": "ok"},
                {"id": 2, "state": "error"},
                {"id": 3, "state": "ok"},
                {"id": 4, "state": "pending"},
                {"id": 5, "state": "ok"},
            ],
            "as": "item",
            "concurrency": 5,
            "when": {"$ref": "loop.item.state", "$eq": "ok"},
            "execute": {"op": Operation.API_CALL, "target": "test.endpoint"},
        }

        result = await handler.execute(node, mock_context, registry, runner)

        assert result["ok"] is True
        # Only 3 items have state="ok"
        assert len(result["result"]) == 3
        assert result["warnings"]["skipped_count"] == 2
