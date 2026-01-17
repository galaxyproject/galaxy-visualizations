"""Tests for Pydantic schema validation."""

import pytest
from pydantic import ValidationError

from polaris.modules.schema import (
    AgentDefinition,
    ComputeNode,
    ControlNode,
    ExecutorNode,
    InputSpec,
    LoopNode,
    PlannerNode,
    ReasoningNode,
    StateSpec,
    TerminalNode,
    TraverseNode,
    validate_agent,
)


class TestInputSpec:
    def test_valid_input_spec(self):
        spec = InputSpec(type="string")
        assert spec.type == "string"
        assert spec.default is None
        assert spec.required is True

    def test_input_spec_with_default(self):
        spec = InputSpec(type="integer", default=10, required=False)
        assert spec.type == "integer"
        assert spec.default == 10
        assert spec.required is False

    def test_invalid_type_rejected(self):
        with pytest.raises(ValidationError):
            InputSpec(type="invalid_type")

    def test_all_valid_types(self):
        for t in ["string", "integer", "number", "boolean", "array", "object"]:
            spec = InputSpec(type=t)
            assert spec.type == t


class TestStateSpec:
    def test_valid_state_spec(self):
        spec = StateSpec(type="array")
        assert spec.type == "array"
        assert spec.default is None

    def test_state_spec_with_default(self):
        spec = StateSpec(type="object", default={})
        assert spec.default == {}


class TestTerminalNode:
    def test_minimal_terminal(self):
        node = TerminalNode(type="terminal")
        assert node.type == "terminal"
        assert node.output is None

    def test_terminal_with_output(self):
        node = TerminalNode(type="terminal", output={"result": "done"})
        assert node.output == {"result": "done"}

    def test_terminal_rejects_extra_fields(self):
        with pytest.raises(ValidationError):
            TerminalNode(type="terminal", invalid_field="test")


class TestExecutorNode:
    def test_api_call_executor(self):
        node = ExecutorNode(
            type="executor",
            run={"op": "api.call", "target": "galaxy.datasets.show.get"},
            next="done",
        )
        assert node.type == "executor"
        assert node.run.op == "api.call"
        assert node.run.target == "galaxy.datasets.show.get"
        assert node.next == "done"

    def test_agent_call_executor(self):
        node = ExecutorNode(
            type="executor",
            run={"op": "system.agent.call", "agent_id": "sub_agent"},
        )
        assert node.run.op == "system.agent.call"
        assert node.run.agent_id == "sub_agent"

    def test_wait_executor(self):
        node = ExecutorNode(
            type="executor",
            run={"op": "system.wait", "input": {"seconds": 5}},
        )
        assert node.run.op == "system.wait"

    def test_executor_with_emit(self):
        node = ExecutorNode(
            type="executor",
            run={"op": "api.call", "target": "test.api"},
            emit={"state.result": "result"},
        )
        assert node.emit == {"state.result": "result"}

    def test_invalid_op_rejected(self):
        with pytest.raises(ValidationError):
            ExecutorNode(
                type="executor",
                run={"op": "invalid.op", "target": "test"},
            )


class TestReasoningNode:
    def test_minimal_reasoning(self):
        node = ReasoningNode(
            type="reasoning",
            prompt="Analyze this data",
        )
        assert node.type == "reasoning"
        assert node.prompt == "Analyze this data"

    def test_reasoning_with_input(self):
        node = ReasoningNode(
            type="reasoning",
            prompt="Process data",
            input={"data": {"$ref": "state.data"}},
            emit={"state.analysis": {"$ref": "result"}},
            next="done",
        )
        assert "data" in node.input
        assert node.next == "done"


class TestTraverseNode:
    def test_minimal_traverse(self):
        node = TraverseNode(
            type="traverse",
            seed={"$ref": "state.source"},
            seed_type="dataset",
            types={
                "dataset": {
                    "id_field": "id",
                    "fetch": {"target": "galaxy.datasets.show.get", "id_param": "dataset_id"},
                }
            },
        )
        assert node.type == "traverse"
        assert node.seed_type == "dataset"
        assert "dataset" in node.types

    def test_traverse_with_relations(self):
        node = TraverseNode(
            type="traverse",
            seed={"$ref": "state.source"},
            seed_type="dataset",
            max_depth=10,
            max_per_level=20,
            types={
                "dataset": {
                    "id_field": "id",
                    "fetch": {"target": "galaxy.datasets.show.get"},
                    "relations": {
                        "creating_job": {"type": "job", "extract": "creating_job"}
                    },
                },
                "job": {
                    "id_field": "id",
                    "fetch": {"target": "galaxy.jobs.show.get"},
                },
            },
        )
        assert node.max_depth == 10
        assert "creating_job" in node.types["dataset"].relations


class TestLoopNode:
    def test_minimal_loop(self):
        node = LoopNode(
            type="loop",
            over={"$ref": "state.items"},
        )
        assert node.type == "loop"
        assert node.as_ == "item"  # default
        assert node.concurrency == 1
        assert node.on_error == "continue"

    def test_loop_with_all_options(self):
        node = LoopNode(
            type="loop",
            over={"$ref": "state.items"},
            **{"as": "dataset"},  # alias for as_
            delay=0.5,
            concurrency=5,
            on_error="stop",
            execute={"op": "api.call", "target": "test.api"},
            emit={"state.results": {"$append": "result"}},
            next="done",
        )
        assert node.as_ == "dataset"
        assert node.delay == 0.5
        assert node.concurrency == 5
        assert node.on_error == "stop"

    def test_loop_invalid_on_error(self):
        with pytest.raises(ValidationError):
            LoopNode(
                type="loop",
                over=[1, 2, 3],
                on_error="invalid",
            )


class TestControlNode:
    def test_control_with_condition(self):
        node = ControlNode(
            type="control",
            condition={
                "field": "state.count",
                "op": "gt",
                "value": 0,
                "then": "process",
                "else": "done",
            },
        )
        assert node.type == "control"


class TestComputeNode:
    def test_minimal_compute(self):
        node = ComputeNode(type="compute")
        assert node.type == "compute"

    def test_compute_with_emit(self):
        node = ComputeNode(
            type="compute",
            emit={"state.computed": {"$expr": {"op": "len", "arg": {"$ref": "state.items"}}}},
            next="done",
        )
        assert "state.computed" in node.emit


class TestPlannerNode:
    def test_minimal_planner(self):
        node = PlannerNode(type="planner")
        assert node.type == "planner"
        assert node.prompt == ""
        assert node.tools == []

    def test_planner_with_options(self):
        node = PlannerNode(
            type="planner",
            prompt="Plan the analysis",
            tools=["search", "fetch"],
            output_schema={"type": "object"},
        )
        assert node.prompt == "Plan the analysis"
        assert node.tools == ["search", "fetch"]


class TestAgentDefinition:
    def test_minimal_valid_agent(self):
        agent = AgentDefinition(
            version=1,
            id="test_agent",
            start="done",
            nodes={"done": {"type": "terminal"}},
        )
        assert agent.version == 1
        assert agent.id == "test_agent"
        assert agent.kind == "agent_pipeline"

    def test_agent_with_inputs_and_state(self):
        agent = AgentDefinition(
            version=1,
            id="test_agent",
            start="step1",
            inputs={
                "dataset_id": {"type": "string"},
                "depth": {"type": "integer", "default": 10},
            },
            state={
                "results": {"type": "array"},
                "current": {"type": "object"},
            },
            nodes={
                "step1": {"type": "compute", "next": "done"},
                "done": {"type": "terminal"},
            },
        )
        assert "dataset_id" in agent.inputs
        assert agent.inputs["depth"].default == 10
        assert "results" in agent.state

    def test_agent_validates_start_exists(self):
        with pytest.raises(ValidationError, match="Start node.*not found"):
            AgentDefinition(
                version=1,
                id="test",
                start="nonexistent",
                nodes={"done": {"type": "terminal"}},
            )

    def test_agent_validates_next_exists(self):
        with pytest.raises(ValidationError, match="references non-existent next node"):
            AgentDefinition(
                version=1,
                id="test",
                start="step1",
                nodes={
                    "step1": {"type": "compute", "next": "nonexistent"},
                    "done": {"type": "terminal"},
                },
            )

    def test_agent_requires_terminal(self):
        with pytest.raises(ValidationError, match="must have at least one terminal"):
            AgentDefinition(
                version=1,
                id="test",
                start="step1",
                nodes={
                    "step1": {"type": "compute"},
                },
            )

    def test_agent_rejects_invalid_version(self):
        with pytest.raises(ValidationError):
            AgentDefinition(
                version=2,  # Only version 1 supported
                id="test",
                start="done",
                nodes={"done": {"type": "terminal"}},
            )

    def test_agent_rejects_empty_id(self):
        with pytest.raises(ValidationError):
            AgentDefinition(
                version=1,
                id="",
                start="done",
                nodes={"done": {"type": "terminal"}},
            )

    def test_agent_rejects_extra_fields(self):
        with pytest.raises(ValidationError):
            AgentDefinition(
                version=1,
                id="test",
                start="done",
                nodes={"done": {"type": "terminal"}},
                unknown_field="value",
            )


class TestValidateAgentFunction:
    def test_validate_agent_dict(self):
        data = {
            "version": 1,
            "id": "test",
            "start": "done",
            "nodes": {"done": {"type": "terminal"}},
        }
        agent = validate_agent(data)
        assert isinstance(agent, AgentDefinition)
        assert agent.id == "test"

    def test_validate_agent_raises_on_invalid(self):
        with pytest.raises(ValidationError):
            validate_agent({"version": 1, "id": "test"})  # Missing required fields


class TestComplexAgentDefinition:
    """Test validation of a complex, realistic agent definition."""

    def test_report_generator_style_agent(self):
        """Test a complex agent similar to report_generator.yml."""
        agent = validate_agent({
            "version": 1,
            "id": "report_generator",
            "kind": "agent_pipeline",
            "description": "Generate reports from analysis",
            "start": "fetch_source",
            "inputs": {
                "dataset_id": {"type": "string"},
                "depth": {"type": "integer"},
            },
            "state": {
                "source_dataset": {"type": "object"},
                "dataset_details": {"type": "array"},
                "job_details": {"type": "array"},
            },
            "nodes": {
                "fetch_source": {
                    "type": "executor",
                    "run": {
                        "op": "api.call",
                        "target": "galaxy.datasets.show.get",
                        "input": {"dataset_id": {"$ref": "inputs.dataset_id"}},
                    },
                    "emit": {"state.source_dataset": "result"},
                    "next": "traverse_upstream",
                },
                "traverse_upstream": {
                    "type": "traverse",
                    "seed": {"$ref": "state.source_dataset"},
                    "seed_type": "dataset",
                    "max_depth": {"$ref": "inputs.depth"},
                    "types": {
                        "dataset": {
                            "id_field": "id",
                            "fetch": {
                                "target": "galaxy.datasets.show.get",
                                "id_param": "dataset_id",
                            },
                            "relations": {
                                "creating_job": {"type": "job", "extract": "creating_job"},
                            },
                        },
                        "job": {
                            "id_field": "id",
                            "fetch": {
                                "target": "galaxy.jobs.show.get",
                                "id_param": "job_id",
                            },
                        },
                    },
                    "emit": {
                        "state.dataset_details": {"$ref": "result.dataset"},
                        "state.job_details": {"$ref": "result.job"},
                    },
                    "next": "analyze",
                },
                "analyze": {
                    "type": "reasoning",
                    "prompt": "Analyze the workflow data",
                    "input": {
                        "datasets": {"$ref": "state.dataset_details"},
                        "jobs": {"$ref": "state.job_details"},
                    },
                    "emit": {"state.analysis": {"$ref": "result"}},
                    "next": "done",
                },
                "done": {
                    "type": "terminal",
                    "output": {
                        "analysis": {"$ref": "state.analysis"},
                        "dataset_count": {
                            "$expr": {"op": "len", "arg": {"$ref": "state.dataset_details"}}
                        },
                    },
                },
            },
        })

        assert agent.id == "report_generator"
        assert len(agent.nodes) == 4
        assert isinstance(agent.nodes["fetch_source"], ExecutorNode)
        assert isinstance(agent.nodes["traverse_upstream"], TraverseNode)
        assert isinstance(agent.nodes["analyze"], ReasoningNode)
        assert isinstance(agent.nodes["done"], TerminalNode)


class TestDynamicValues:
    """Test that $ref and $expr values are accepted in node definitions."""

    def test_ref_in_executor_input(self):
        """Verify $ref expressions are accepted in executor input."""
        node = ExecutorNode(
            type="executor",
            run={
                "op": "api.call",
                "target": "test.api",
                "input": {"id": {"$ref": "inputs.dataset_id"}},
            },
        )
        assert "id" in node.run.input
        assert "$ref" in node.run.input["id"]

    def test_expr_in_emit(self):
        """Verify $expr expressions are accepted in emit."""
        from polaris.modules.schema import ComputedExpr

        node = ComputeNode(
            type="compute",
            emit={
                "state.count": {
                    "$expr": {"op": "len", "arg": {"$ref": "state.items"}}
                }
            },
        )
        assert "state.count" in node.emit
        # $expr is parsed into ComputedExpr model at emit level
        assert isinstance(node.emit["state.count"], ComputedExpr)
        assert node.emit["state.count"].expr["op"] == "len"

    def test_nested_refs_and_exprs(self):
        """Verify complex nested $ref and $expr structures are accepted."""
        from polaris.modules.schema import ComputedExpr, RefExpr

        node = TerminalNode(
            type="terminal",
            output={
                "simple_ref": {"$ref": "state.data"},
                "computed": {
                    "$expr": {
                        "op": "filter",
                        "from": {"$ref": "state.items"},
                        "where": {"field": "status", "eq": "ok"},
                    }
                },
                "nested": {
                    "inner": {"$ref": "state.inner"},
                    "list": [{"$ref": "state.a"}, {"$ref": "state.b"}],
                },
            },
        )
        # At the output level, $ref and $expr are parsed into models
        assert isinstance(node.output["simple_ref"], RefExpr)
        assert node.output["simple_ref"].ref == "state.data"
        assert isinstance(node.output["computed"], ComputedExpr)
        assert node.output["computed"].expr["op"] == "filter"
