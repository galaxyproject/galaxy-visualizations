"""Integration tests for full agent execution with mocked external services."""

from typing import Any, cast

import pytest

from polaris.modules.runner import Runner


class MockAgentResolver:
    """Mock agent resolver for sub-agent calls."""

    def __init__(self, agents: dict[str, Any]) -> None:
        self._agents = agents

    def resolve_agent(self, agent_id: str) -> dict[str, Any]:
        return self._agents.get(agent_id, {})


class MockRegistry:
    """Mock registry that simulates Galaxy API and LLM responses."""

    def __init__(
        self,
        api_responses: dict[str, Any] | None = None,
        reasoning_responses: dict[str, str] | None = None,
    ) -> None:
        self.api_responses = api_responses or {}
        self.reasoning_responses = reasoning_responses or {}
        self.api_calls: list[dict[str, Any]] = []
        self.reasoning_calls: list[dict[str, Any]] = []
        self.agents = MockAgentResolver({})

    async def call_api(self, ctx: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
        """Mock API call that returns predefined responses."""
        _ = ctx  # unused
        target = spec.get("target", "")
        self.api_calls.append({"target": target, "input": spec.get("input")})

        if target in self.api_responses:
            response = self.api_responses[target]
            if callable(response):
                return cast(dict[str, Any], response(spec.get("input")))
            return {"ok": True, "result": response}

        return {"ok": True, "result": {"id": "mock-id", "name": "mock-name"}}

    async def plan(self, ctx: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
        """Mock plan call."""
        return {"next": "end"}

    async def reason(self, prompt: str, input: Any) -> str:
        """Mock reasoning call that returns predefined responses."""
        self.reasoning_calls.append({"prompt": prompt, "input": input})

        # Return matching response or default
        for key, response in self.reasoning_responses.items():
            if key in prompt:
                return response

        return "Mock reasoning response"


class TestSimpleAgentExecution:
    """Test simple agent execution flows."""

    @pytest.mark.asyncio
    async def test_linear_executor_chain(self):
        """Test a simple linear chain of executor nodes."""
        agent = {
            "id": "linear_agent",
            "start": "step1",
            "nodes": {
                "step1": {
                    "type": "executor",
                    "run": {
                        "op": "api.call",
                        "target": "api.first",
                        "input": {"id": {"$ref": "inputs.item_id"}},
                    },
                    "emit": {"state.first_result": "result"},
                    "next": "step2",
                },
                "step2": {
                    "type": "executor",
                    "run": {
                        "op": "api.call",
                        "target": "api.second",
                        "input": {"data": {"$ref": "state.first_result"}},
                    },
                    "emit": {"state.second_result": "result"},
                    "next": "done",
                },
                "done": {
                    "type": "terminal",
                    "output": {
                        "first": {"$ref": "state.first_result"},
                        "second": {"$ref": "state.second_result"},
                    },
                },
            },
        }

        registry = MockRegistry(
            api_responses={
                "api.first": {"value": "first-value"},
                "api.second": {"value": "second-value"},
            }
        )

        runner = Runner(agent, registry)
        result = await runner.run({"item_id": "test-123"})

        assert result["last"]["ok"] is True
        assert result["last"]["result"]["first"]["value"] == "first-value"
        assert result["last"]["result"]["second"]["value"] == "second-value"
        assert len(registry.api_calls) == 2
        assert registry.api_calls[0]["target"] == "api.first"
        assert registry.api_calls[1]["target"] == "api.second"

    @pytest.mark.asyncio
    async def test_compute_with_expressions(self):
        """Test compute node with expression evaluation."""
        agent = {
            "id": "compute_agent",
            "start": "fetch",
            "nodes": {
                "fetch": {
                    "type": "executor",
                    "run": {
                        "op": "api.call",
                        "target": "api.list",
                    },
                    "emit": {"state.items": "result"},
                    "next": "compute",
                },
                "compute": {
                    "type": "compute",
                    "emit": {
                        "state.count": {"$expr": {"op": "len", "arg": {"$ref": "state.items"}}},
                    },
                    "next": "done",
                },
                "done": {
                    "type": "terminal",
                    "output": {
                        "items": {"$ref": "state.items"},
                        "count": {"$ref": "state.count"},
                    },
                },
            },
        }

        registry = MockRegistry(
            api_responses={
                "api.list": [{"id": 1}, {"id": 2}, {"id": 3}],
            }
        )

        runner = Runner(agent, registry)
        result = await runner.run({})

        assert result["last"]["ok"] is True
        assert result["last"]["result"]["count"] == 3
        assert len(result["last"]["result"]["items"]) == 3


class TestReasoningIntegration:
    """Test agents with reasoning nodes."""

    @pytest.mark.asyncio
    async def test_reasoning_with_context(self):
        """Test reasoning node receives correct context."""
        agent = {
            "id": "reasoning_agent",
            "start": "fetch",
            "nodes": {
                "fetch": {
                    "type": "executor",
                    "run": {
                        "op": "api.call",
                        "target": "api.data",
                    },
                    "emit": {"state.data": "result"},
                    "next": "analyze",
                },
                "analyze": {
                    "type": "reasoning",
                    "prompt": "Analyze the data and summarize findings",
                    "input": {
                        "data": {"$ref": "state.data"},
                    },
                    "emit": {"state.analysis": {"$ref": "result"}},
                    "next": "done",
                },
                "done": {
                    "type": "terminal",
                    "output": {
                        "analysis": {"$ref": "state.analysis"},
                    },
                },
            },
        }

        registry = MockRegistry(
            api_responses={
                "api.data": {"metrics": [1, 2, 3], "name": "test"},
            },
            reasoning_responses={
                "Analyze": "The data shows 3 metrics with values 1, 2, and 3.",
            },
        )

        runner = Runner(agent, registry)
        result = await runner.run({})

        assert result["last"]["ok"] is True
        assert "3 metrics" in result["last"]["result"]["analysis"]
        assert len(registry.reasoning_calls) == 1
        assert "data" in registry.reasoning_calls[0]["input"]


class TestLoopIntegration:
    """Test agents with loop nodes."""

    @pytest.mark.asyncio
    async def test_loop_over_items(self):
        """Test loop node iterating over items."""
        agent = {
            "id": "loop_agent",
            "start": "setup",
            "nodes": {
                "setup": {
                    "type": "compute",
                    "emit": {
                        "state.items": ["a", "b", "c"],
                        "state.results": [],
                    },
                    "next": "loop",
                },
                "loop": {
                    "type": "loop",
                    "over": {"$ref": "state.items"},
                    "as": "item",
                    "execute": {
                        "op": "api.call",
                        "target": "api.process",
                        "input": {"value": {"$ref": "loop.item"}},
                    },
                    "emit": {
                        "state.results": {"$append": "result"},
                    },
                    "next": "done",
                },
                "done": {
                    "type": "terminal",
                    "output": {
                        "results": {"$ref": "state.results"},
                    },
                },
            },
        }

        def process_handler(input_data):
            value = input_data.get("value", "") if input_data else ""
            return {"ok": True, "result": f"processed-{value}"}

        registry = MockRegistry(
            api_responses={
                "api.process": process_handler,
            }
        )

        runner = Runner(agent, registry)
        result = await runner.run({})

        assert result["last"]["ok"] is True
        assert len(result["last"]["result"]["results"]) == 3
        assert result["last"]["result"]["results"] == [
            "processed-a",
            "processed-b",
            "processed-c",
        ]
        assert len(registry.api_calls) == 3


class TestControlFlowIntegration:
    """Test agents with control flow nodes."""

    @pytest.mark.asyncio
    async def test_conditional_branching(self):
        """Test control node branching based on state."""
        agent = {
            "id": "control_agent",
            "start": "fetch",
            "nodes": {
                "fetch": {
                    "type": "executor",
                    "run": {
                        "op": "api.call",
                        "target": "api.check",
                    },
                    "emit": {"state.status": "result"},
                    "next": "branch",
                },
                "branch": {
                    "type": "control",
                    "condition": {
                        "op": "control.branch",
                        "cases": [
                            {"when": {"state.status.active": True}, "next": "process"},
                        ],
                        "default": "skip",
                    },
                },
                "process": {
                    "type": "compute",
                    "emit": {"state.processed": True},
                    "next": "done",
                },
                "skip": {
                    "type": "compute",
                    "emit": {"state.processed": False},
                    "next": "done",
                },
                "done": {
                    "type": "terminal",
                    "output": {
                        "processed": {"$ref": "state.processed"},
                    },
                },
            },
        }

        # Test active=True path
        registry = MockRegistry(
            api_responses={
                "api.check": {"active": True},
            }
        )
        runner = Runner(agent, registry)
        result = await runner.run({})

        assert result["last"]["ok"] is True
        assert result["last"]["result"]["processed"] is True

        # Test active=False path
        registry = MockRegistry(
            api_responses={
                "api.check": {"active": False},
            }
        )
        runner = Runner(agent, registry)
        result = await runner.run({})

        assert result["last"]["ok"] is True
        assert result["last"]["result"]["processed"] is False


class TestReportGeneratorStyle:
    """Test a realistic agent similar to report_generator."""

    @pytest.mark.asyncio
    async def test_multi_step_analysis_pipeline(self):
        """Test a multi-step pipeline with fetch, traverse-like behavior, and reasoning."""
        agent = {
            "id": "analysis_pipeline",
            "start": "fetch_source",
            "nodes": {
                "fetch_source": {
                    "type": "executor",
                    "run": {
                        "op": "api.call",
                        "target": "galaxy.datasets.show",
                        "input": {"dataset_id": {"$ref": "inputs.dataset_id"}},
                    },
                    "emit": {"state.source": "result"},
                    "next": "fetch_history",
                },
                "fetch_history": {
                    "type": "executor",
                    "run": {
                        "op": "api.call",
                        "target": "galaxy.histories.show",
                        "input": {"history_id": {"$ref": "state.source.history_id"}},
                    },
                    "emit": {"state.history": "result"},
                    "next": "fetch_jobs",
                },
                "fetch_jobs": {
                    "type": "executor",
                    "run": {
                        "op": "api.call",
                        "target": "galaxy.jobs.list",
                        "input": {"history_id": {"$ref": "state.history.id"}},
                    },
                    "emit": {"state.jobs": "result"},
                    "next": "analyze",
                },
                "analyze": {
                    "type": "reasoning",
                    "prompt": "Analyze workflow and generate summary",
                    "input": {
                        "history_name": {"$ref": "state.history.name"},
                        "jobs": {"$ref": "state.jobs"},
                    },
                    "emit": {"state.analysis": {"$ref": "result"}},
                    "next": "done",
                },
                "done": {
                    "type": "terminal",
                    "output": {
                        "history": {
                            "id": {"$ref": "state.history.id"},
                            "name": {"$ref": "state.history.name"},
                        },
                        "job_count": {"$expr": {"op": "len", "arg": {"$ref": "state.jobs"}}},
                        "analysis": {"$ref": "state.analysis"},
                    },
                },
            },
        }

        registry = MockRegistry(
            api_responses={
                "galaxy.datasets.show": {
                    "id": "ds-001",
                    "name": "output.bam",
                    "history_id": "hist-001",
                },
                "galaxy.histories.show": {
                    "id": "hist-001",
                    "name": "RNA-seq Analysis",
                },
                "galaxy.jobs.list": [
                    {"id": "job-1", "tool_id": "bwa"},
                    {"id": "job-2", "tool_id": "samtools_sort"},
                    {"id": "job-3", "tool_id": "featurecounts"},
                ],
            },
            reasoning_responses={
                "Analyze workflow": "This pipeline performs RNA-seq analysis with alignment and counting.",
            },
        )

        runner = Runner(agent, registry)
        result = await runner.run({"dataset_id": "ds-001"})

        assert result["last"]["ok"] is True
        output = result["last"]["result"]
        assert output["history"]["id"] == "hist-001"
        assert output["history"]["name"] == "RNA-seq Analysis"
        assert output["job_count"] == 3
        assert "RNA-seq" in output["analysis"]

        # Verify API call sequence
        assert len(registry.api_calls) == 3
        assert registry.api_calls[0]["target"] == "galaxy.datasets.show"
        assert registry.api_calls[1]["target"] == "galaxy.histories.show"
        assert registry.api_calls[2]["target"] == "galaxy.jobs.list"


class TestErrorHandling:
    """Test error handling in agent execution."""

    @pytest.mark.asyncio
    async def test_api_failure_propagation(self):
        """Test that API failures are properly propagated."""
        agent = {
            "id": "error_agent",
            "start": "fetch",
            "nodes": {
                "fetch": {
                    "type": "executor",
                    "run": {
                        "op": "api.call",
                        "target": "api.failing",
                    },
                    "next": "done",
                },
                "done": {
                    "type": "terminal",
                },
            },
        }

        class FailingRegistry(MockRegistry):
            async def call_api(self, ctx: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
                _ = ctx, spec  # unused
                return {"ok": False, "error": {"code": "API_ERROR", "message": "Service unavailable"}}

        registry = FailingRegistry()
        runner = Runner(agent, registry)
        result = await runner.run({})

        assert result["last"]["ok"] is False
        assert result["last"]["error"]["code"] == "API_ERROR"

    @pytest.mark.asyncio
    async def test_missing_node_reference(self):
        """Test handling of missing node references."""
        agent = {
            "id": "missing_node_agent",
            "start": "step1",
            "nodes": {
                "step1": {
                    "type": "compute",
                    "next": "nonexistent_node",
                },
                "done": {
                    "type": "terminal",
                },
            },
        }

        registry = MockRegistry()
        runner = Runner(agent, registry)
        result = await runner.run({})

        assert result["last"]["ok"] is False
        error_code = result["last"]["error"]["code"]
        # Handle both string and Enum error codes
        assert "unknown_node" in (error_code.value if hasattr(error_code, "value") else str(error_code))
