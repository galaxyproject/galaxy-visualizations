"""Pydantic models for agent definition validation."""

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, model_validator


# Value types that can include template references
TemplateValue = Union[str, int, float, bool, dict[str, Any], list[Any], None]


class RefExpr(BaseModel):
    """Reference expression ($ref)."""

    ref: str = Field(..., alias="$ref")


class ComputedExpr(BaseModel):
    """Computed expression ($expr)."""

    expr: dict[str, Any] = Field(..., alias="$expr")


# Union of possible value types including expressions
DynamicValue = Union[RefExpr, ComputedExpr, TemplateValue]


class InputSpec(BaseModel):
    """Input parameter specification."""

    type: Literal["string", "integer", "number", "boolean", "array", "object"]
    default: Any = None
    required: bool = True


class StateSpec(BaseModel):
    """State variable specification."""

    type: Literal["string", "integer", "number", "boolean", "array", "object"]
    default: Any = None


# --- Run specifications for executor nodes ---


class ApiCallRunSpec(BaseModel):
    """API call operation specification."""

    op: Literal["api.call"]
    target: str
    input: DynamicValue = None


class AgentCallRunSpec(BaseModel):
    """Agent call operation specification."""

    op: Literal["system.agent.call"]
    agent_id: str
    input: DynamicValue = None


class WaitRunSpec(BaseModel):
    """Wait operation specification."""

    op: Literal["system.wait"]
    input: DynamicValue = None


RunSpec = Annotated[
    Union[ApiCallRunSpec, AgentCallRunSpec, WaitRunSpec],
    Field(discriminator="op"),
]


# --- Traverse type definitions ---


class FetchSpec(BaseModel):
    """Fetch configuration for traverse types."""

    target: str
    id_param: str = "id"


class RelationSpec(BaseModel):
    """Relation definition for traverse types."""

    type: str
    extract: str


class TraverseTypeSpec(BaseModel):
    """Type definition for traverse nodes."""

    id_field: str = "id"
    fetch: FetchSpec | None = None
    relations: dict[str, RelationSpec] = Field(default_factory=dict)


# --- Loop execute specification ---


class LoopExecuteSpec(BaseModel):
    """Execute specification for loop iterations."""

    op: Literal["api.call", "system.wait"]
    target: str | None = None
    input: DynamicValue = None


# --- Control condition specification ---


class ControlCondition(BaseModel):
    """Control flow condition specification."""

    field: str
    op: Literal["eq", "ne", "gt", "lt", "gte", "lte", "in", "not_in", "exists", "not_exists"]
    value: Any = None
    then: str
    else_: str | None = Field(None, alias="else")


# --- Node definitions ---


class BaseNode(BaseModel):
    """Base class for all node types."""

    emit: dict[str, DynamicValue] | None = None
    next: str | None = None

    model_config = {"extra": "forbid"}


class ExecutorNode(BaseNode):
    """Executor node - performs API calls, agent calls, or wait operations."""

    type: Literal["executor"]
    run: RunSpec


class TraverseNode(BaseNode):
    """Traverse node - BFS graph traversal with targeted API calls."""

    type: Literal["traverse"]
    seed: DynamicValue
    seed_type: str
    types: dict[str, TraverseTypeSpec]
    max_depth: DynamicValue = None
    max_per_level: DynamicValue = None


class ReasoningNode(BaseNode):
    """Reasoning node - AI-powered analysis and generation."""

    type: Literal["reasoning"]
    prompt: str
    input: dict[str, DynamicValue] | None = None


class TerminalNode(BaseModel):
    """Terminal node - ends execution and returns output."""

    type: Literal["terminal"]
    output: dict[str, DynamicValue] | DynamicValue | None = None

    model_config = {"extra": "forbid"}


class ControlNode(BaseModel):
    """Control node - conditional branching."""

    type: Literal["control"]
    condition: ControlCondition | dict[str, Any]

    model_config = {"extra": "forbid"}


class LoopNode(BaseNode):
    """Loop node - iterate over arrays with sequential or concurrent execution."""

    type: Literal["loop"]
    over: DynamicValue
    as_: str = Field("item", alias="as")
    delay: float = 0
    concurrency: int = 1
    on_error: Literal["continue", "stop"] = "continue"
    when: DynamicValue | None = None
    execute: LoopExecuteSpec | None = None


class ComputeNode(BaseNode):
    """Compute node - local computation without external calls."""

    type: Literal["compute"]


class PlannerRouteSpec(BaseModel):
    """Route definition with description and target node."""

    description: str = Field(..., min_length=1)
    next: str = Field(..., min_length=1)


class PlannerNode(BaseModel):
    """Planner node - LLM-powered decision making with structured JSON output.

    Two modes:
    - route: Emits {"route": <enum>} for control flow decisions. Routes map to next nodes.
    - json: Emits a parameter object for downstream computation. Must have static next.

    Planners never emit tool calls. All output is validated JSON.
    """

    type: Literal["planner"]
    prompt: str = ""
    output_mode: Literal["route", "json"]
    input: dict[str, Any] | None = None

    # Route mode: enum -> node mapping
    routes: dict[str, PlannerRouteSpec] | None = None

    # JSON mode: parameter schema
    output_schema: dict[str, Any] | None = None

    # Common fields
    emit: dict[str, Any] | None = None
    next: str | None = None

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_mode_config(self) -> "PlannerNode":
        """Validate mode-specific configuration."""
        if self.output_mode == "route":
            if self.routes is None:
                raise ValueError("Route planners require 'routes'")
            if not self.routes:
                raise ValueError("Route planners require at least one route")
            if self.next is not None:
                raise ValueError(
                    "Route planners cannot have static 'next' - "
                    "next node is determined by route selection"
                )
            if self.output_schema is not None:
                raise ValueError("Route planners cannot have 'output_schema'")

        elif self.output_mode == "json":
            if self.output_schema is None:
                raise ValueError("JSON planners require 'output_schema'")
            if self.next is None:
                raise ValueError("JSON planners require static 'next'")
            if self.routes is not None:
                raise ValueError("JSON planners cannot have 'routes'")

        return self


class MaterializerNode(BaseNode):
    """Materializer node - pure Python function invocation.

    Properties:
    - Deterministic execution (no LLM calls, no branching on content)
    - Explicit arguments resolved before invocation
    - Optional workspace path for file I/O
    - No side effects outside the workspace
    - No authority over control flow

    The target must reference a pre-registered materializer in the catalog.
    """

    type: Literal["materializer"]
    target: str = Field(..., min_length=1, description="Catalog identifier for the materializer")
    args: dict[str, DynamicValue] = Field(default_factory=dict, description="Arguments to pass to the function")
    workspace: DynamicValue | None = Field(None, description="Optional workspace path for file I/O")
    input_schema: dict[str, Any] | None = Field(None, description="JSON Schema for eager argument validation")


# Union of all node types
NodeDefinition = Annotated[
    Union[
        ExecutorNode,
        TraverseNode,
        ReasoningNode,
        TerminalNode,
        ControlNode,
        LoopNode,
        ComputeNode,
        PlannerNode,
        MaterializerNode,
    ],
    Field(discriminator="type"),
]


class AgentDefinition(BaseModel):
    """Complete agent definition."""

    version: int = Field(..., ge=1, le=1)
    id: str = Field(..., min_length=1)
    kind: Literal["agent_pipeline"] = "agent_pipeline"
    description: str | None = None
    start: str = Field(..., min_length=1)
    inputs: dict[str, InputSpec] = Field(default_factory=dict)
    state: dict[str, StateSpec] = Field(default_factory=dict)
    nodes: dict[str, NodeDefinition] = Field(..., min_length=1)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_start_node_exists(self) -> "AgentDefinition":
        """Validate that the start node exists in nodes."""
        if self.start not in self.nodes:
            raise ValueError(f"Start node '{self.start}' not found in nodes")
        return self

    @model_validator(mode="after")
    def validate_next_nodes_exist(self) -> "AgentDefinition":
        """Validate that all 'next' references point to existing nodes."""
        for node_id, node in self.nodes.items():
            next_node = getattr(node, "next", None)
            if next_node is not None and next_node not in self.nodes:
                raise ValueError(
                    f"Node '{node_id}' references non-existent next node '{next_node}'"
                )
        return self

    @model_validator(mode="after")
    def validate_has_terminal(self) -> "AgentDefinition":
        """Validate that at least one terminal node exists."""
        has_terminal = any(
            isinstance(node, TerminalNode) for node in self.nodes.values()
        )
        if not has_terminal:
            raise ValueError("Agent must have at least one terminal node")
        return self

    @model_validator(mode="after")
    def validate_json_planner_targets(self) -> "AgentDefinition":
        """Ensure JSON planners only connect to materializer or compute nodes."""
        allowed_targets = {"materializer", "compute"}

        for node_id, node in self.nodes.items():
            if not isinstance(node, PlannerNode):
                continue
            if node.output_mode != "json":
                continue
            if node.next is None:
                continue  # Caught by node-level validator

            next_node = self.nodes.get(node.next)
            if next_node is None:
                continue  # Caught by existing validator

            next_type = getattr(next_node, "type", None)
            if next_type not in allowed_targets:
                raise ValueError(
                    f"JSON planner '{node_id}' connects to {next_type} "
                    f"node '{node.next}'. JSON planners may only feed: "
                    f"{', '.join(sorted(allowed_targets))}"
                )

        return self

    @model_validator(mode="after")
    def validate_route_planner_targets(self) -> "AgentDefinition":
        """Ensure all route planner targets reference existing nodes."""
        for node_id, node in self.nodes.items():
            if not isinstance(node, PlannerNode):
                continue
            if node.output_mode != "route":
                continue
            if node.routes is None:
                continue  # Caught by node-level validator

            for route_name, route_spec in node.routes.items():
                if route_spec.next not in self.nodes:
                    raise ValueError(
                        f"Route planner '{node_id}' route '{route_name}' "
                        f"references non-existent node '{route_spec.next}'"
                    )

        return self


def validate_agent(data: dict[str, Any]) -> AgentDefinition:
    """Validate an agent definition dictionary and return a validated model.

    Args:
        data: Raw agent definition dictionary (e.g., from YAML)

    Returns:
        Validated AgentDefinition model

    Raises:
        pydantic.ValidationError: If validation fails
    """
    return AgentDefinition.model_validate(data)
