"""Shared mock classes for handler tests."""

from typing import Any


class MockAgentResolver:
    """Mock agent resolver for handler tests."""

    def __init__(self) -> None:
        self._agents: dict[str, Any] = {}

    def resolve_agent(self, agent_id: str) -> dict[str, Any]:
        return self._agents.get(agent_id, {})


class MockRegistry:
    """Mock registry for handler tests."""

    def __init__(self) -> None:
        self.call_api_result: dict[str, Any] = {"ok": True, "result": {"data": "test"}}
        self.plan_result: dict[str, Any] = {"next": "end"}
        self.reason_result: str = "reasoning output"
        self.reason_structured_result: str = '{"route": "process"}'
        self.agents = MockAgentResolver()

    async def call_api(self, ctx: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
        _ = ctx  # unused
        return self.call_api_result

    async def plan(self, ctx: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
        _ = ctx  # unused
        return self.plan_result

    async def reason(self, prompt: str, input: Any) -> str:
        _ = prompt, input  # unused
        return self.reason_result

    async def reason_structured(self, prompt: str, schema: dict[str, Any]) -> str:
        _ = prompt, schema  # unused
        return self.reason_structured_result


class MockResolver:
    """Mock resolver for handler tests."""

    def __init__(self, runner: "MockRunner") -> None:
        self.runner = runner

    def apply_emit(self, emit: Any, payload: Any, ctx: Any) -> None:
        _ = ctx  # unused
        if emit:
            self.runner.emitted.append({"emit": emit, "payload": payload})

    def eval_branch(self, condition: Any, ctx: Any) -> dict[str, str]:
        _ = condition, ctx  # unused
        return {"next": "branch_target"}

    def resolve(self, value: Any, ctx: Any) -> Any:
        _ = ctx  # unused
        return value


class MockLoopResolver:
    """Mock resolver with proper $ref resolution for loop tests."""

    def __init__(self, runner: "MockLoopRunner") -> None:
        self.runner = runner

    def apply_emit(self, emit: Any, payload: Any, ctx: Any) -> None:
        _ = ctx  # unused
        if emit:
            self.runner.emitted.append({"emit": emit, "payload": payload})

    def resolve(self, value: Any, ctx: dict[str, Any]) -> Any:
        if isinstance(value, dict):
            # Handle $eq comparison with $ref
            if "$ref" in value and "$eq" in value:
                ref_value = self._resolve_ref(value["$ref"], ctx)
                return ref_value == value["$eq"]
            if "$ref" in value:
                return self._resolve_ref(value["$ref"], ctx)
            return {k: self.resolve(v, ctx) for k, v in value.items()}
        elif isinstance(value, list):
            return [self.resolve(v, ctx) for v in value]
        return value

    def _resolve_ref(self, ref: str, ctx: dict[str, Any]) -> Any:
        """Resolve a $ref path to its value."""
        parts = ref.split(".")
        if parts[0] == "state":
            obj: Any = self.runner.state
            for part in parts[1:]:
                if isinstance(obj, dict):
                    obj = obj.get(part)
                else:
                    return None
            return obj
        elif parts[0] == "loop":
            obj = ctx.get("loop", {})
            for part in parts[1:]:
                if isinstance(obj, dict):
                    obj = obj.get(part)
                else:
                    return None
            return obj
        elif parts[0] == "result":
            obj = ctx.get("result", {})
            for part in parts[1:]:
                if isinstance(obj, dict):
                    obj = obj.get(part)
                else:
                    return None
            return obj
        return None


class MockRunner:
    """Mock runner for handler tests."""

    def __init__(self) -> None:
        self.state: dict[str, Any] = {}
        self.emitted: list[dict[str, Any]] = []
        self.resolver = MockResolver(self)


class MockLoopRunner:
    """Mock runner with proper $ref resolution for loop tests."""

    def __init__(self) -> None:
        self.state: dict[str, Any] = {}
        self.emitted: list[dict[str, Any]] = []
        self.resolver = MockLoopResolver(self)
