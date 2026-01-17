"""Expanded tests for the runner module."""

from typing import Any

import pytest

from polaris.modules.constants import ControlOp, ErrorCode, NodeType
from polaris.modules.runner import Runner


class MockAgentResolver:
    """Mock agent resolver for runner tests."""

    def __init__(self) -> None:
        self._agents: dict[str, Any] = {}

    def resolve_agent(self, agent_id: str) -> dict[str, Any]:
        return self._agents.get(agent_id, {})


class MockRegistry:
    """Mock registry for runner tests."""

    def __init__(self) -> None:
        self.plan_result: dict[str, Any] = {"next": "end"}
        self.agents = MockAgentResolver()

    async def call_api(self, ctx: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
        return {"ok": True, "result": {"data": "api_response"}}

    async def plan(self, ctx: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
        return self.plan_result

    async def reason(self, prompt: str, input: Any) -> str:
        return "reasoning result"


class TestRunner:
    @pytest.mark.asyncio
    async def test_run_missing_start(self):
        graph = {"nodes": {"a": {"type": "terminal"}}}
        runner = Runner(graph, MockRegistry())
        result = await runner.run({})

        assert result["last"]["ok"] is False
        assert result["last"]["error"]["code"] == ErrorCode.MISSING_START

    @pytest.mark.asyncio
    async def test_run_unknown_node(self):
        graph = {"start": "nonexistent", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        result = await runner.run({})

        assert result["last"]["ok"] is False
        assert result["last"]["error"]["code"] == ErrorCode.UNKNOWN_NODE

    @pytest.mark.asyncio
    async def test_run_terminal_node(self):
        graph = {
            "start": "end",
            "nodes": {
                "end": {"type": NodeType.TERMINAL, "output": {"message": "done"}},
            },
        }
        runner = Runner(graph, MockRegistry())
        result = await runner.run({"input": "test"})

        assert result["last"]["ok"] is True
        assert result["state"]["output"]["message"] == "done"

    @pytest.mark.asyncio
    async def test_run_chain_of_nodes(self):
        graph = {
            "start": "first",
            "nodes": {
                "first": {"type": NodeType.COMPUTE, "next": "second"},
                "second": {"type": NodeType.TERMINAL, "output": {"step": 2}},
            },
        }
        runner = Runner(graph, MockRegistry())
        result = await runner.run({})

        assert result["last"]["ok"] is True
        assert result["state"]["output"]["step"] == 2


class TestResolveTemplates:
    def test_resolve_simple_value(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        ctx = {}

        assert runner.resolver.resolve("string", ctx) == "string"
        assert runner.resolver.resolve(42, ctx) == 42
        assert runner.resolver.resolve(None, ctx) is None

    def test_resolve_ref(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        runner.state["inputs"] = {"name": "test"}
        ctx = {}

        result = runner.resolver.resolve({"$ref": "inputs.name"}, ctx)
        assert result == "test"

    def test_resolve_nested_dict(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        runner.state["inputs"] = {"value": 42}
        ctx = {}

        result = runner.resolver.resolve(
            {"key": "static", "ref": {"$ref": "inputs.value"}}, ctx
        )
        assert result["key"] == "static"
        assert result["ref"] == 42

    def test_resolve_list(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        runner.state["inputs"] = {"a": 1, "b": 2}
        ctx = {}

        result = runner.resolver.resolve(
            [{"$ref": "inputs.a"}, {"$ref": "inputs.b"}], ctx
        )
        assert result == [1, 2]


class TestApplyEmit:
    def test_emit_simple_value(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        ctx = {}

        runner.resolver.apply_emit({"state.output": "result"}, {"result": "value"}, ctx)

        assert runner.state["output"] == "value"

    def test_emit_with_state_prefix(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        ctx = {}

        runner.resolver.apply_emit({"state.data": "result"}, {"result": {"nested": True}}, ctx)

        assert runner.state["data"]["nested"] is True

    def test_emit_without_state_prefix(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        ctx = {}

        runner.resolver.apply_emit({"custom_key": "result"}, {"result": "custom"}, ctx)

        assert runner.state["custom_key"] == "custom"

    def test_emit_none_payload(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        ctx = {}

        runner.resolver.apply_emit({"state.x": "result"}, None, ctx)

        assert "x" not in runner.state

    def test_emit_dict_source(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        runner.state["inputs"] = {"value": 99}
        ctx = {}

        runner.resolver.apply_emit(
            {"state.computed": {"$ref": "inputs.value"}}, {"result": "ignored"}, ctx
        )

        assert runner.state["computed"] == 99


class TestEvalBranch:
    def test_branch_matches_first_case(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        runner.state["inputs"] = {"status": "ok"}
        ctx = {}

        condition = {
            "op": ControlOp.BRANCH,
            "cases": [
                {"when": {"inputs.status": "ok"}, "next": "success"},
                {"when": {"inputs.status": "error"}, "next": "failure"},
            ],
            "default": "unknown",
        }

        result = runner.resolver.eval_branch(condition, ctx)
        assert result["next"] == "success"

    def test_branch_falls_through_to_default(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        runner.state["inputs"] = {"status": "pending"}
        ctx = {}

        condition = {
            "op": ControlOp.BRANCH,
            "cases": [
                {"when": {"inputs.status": "ok"}, "next": "success"},
            ],
            "default": "waiting",
        }

        result = runner.resolver.eval_branch(condition, ctx)
        assert result["next"] == "waiting"

    def test_branch_no_match_no_default(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        runner.state["inputs"] = {"status": "unknown"}
        ctx = {}

        condition = {
            "op": ControlOp.BRANCH,
            "cases": [{"when": {"inputs.status": "ok"}, "next": "success"}],
        }

        result = runner.resolver.eval_branch(condition, ctx)
        assert result["next"] is None

    def test_branch_non_branch_op(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        ctx = {}

        condition = {"op": "other.op"}
        result = runner.resolver.eval_branch(condition, ctx)
        assert result["next"] is None


class TestResolveNext:
    def test_resolve_next_string(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        node = {"next": "next_node"}
        res = {"ok": True}
        ctx = {}

        result = runner._resolve_next(node, res, ctx)
        assert result == "next_node"

    def test_resolve_next_on_error(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        node = {"next": "success", "on": {"error": "error_handler"}}
        res = {"ok": False}
        ctx = {}

        result = runner._resolve_next(node, res, ctx)
        assert result == "error_handler"

    def test_resolve_next_on_ok(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        node = {"on": {"ok": "success_node"}}
        res = {"ok": True}
        ctx = {}

        result = runner._resolve_next(node, res, ctx)
        assert result == "success_node"

    def test_resolve_next_control_node(self):
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        node = {"type": NodeType.CONTROL}
        res = {"ok": True, "result": {"next": "branch_target"}}
        ctx = {}

        result = runner._resolve_next(node, res, ctx)
        assert result == "branch_target"

    def test_resolve_next_on_warning(self):
        """Test on.warning handler triggers when result has warnings."""
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        node = {"next": "normal_next", "on": {"warning": "partial_handler"}}
        res = {"ok": True, "warnings": {"failed_count": 2}}
        ctx = {}

        result = runner._resolve_next(node, res, ctx)
        assert result == "partial_handler"

    def test_resolve_next_warnings_without_handler(self):
        """Test warnings without on.warning handler continues normally."""
        graph = {"start": "a", "nodes": {}}
        runner = Runner(graph, MockRegistry())
        node = {"next": "normal_next"}
        res = {"ok": True, "warnings": {"failed_count": 2}}
        ctx = {}

        result = runner._resolve_next(node, res, ctx)
        assert result == "normal_next"
