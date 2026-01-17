"""Polaris agent execution modules.

This package provides the core components for executing agent pipelines.

Example:
    from polaris.modules import Runner, Registry
    from polaris.modules.schema import validate_agent  # requires pydantic

    agent = validate_agent(yaml.safe_load(agent_yaml))
    registry = await Registry.create(config)
    runner = Runner(agent, registry)
    result = await runner.run(inputs)
"""

from .constants import ControlOp, ErrorCode, NodeType, Operation
from .exceptions import (
    AgentError,
    ApiCallError,
    ConfigurationError,
    ExpressionError,
    NodeExecutionError,
    PlannerError,
    ProviderError,
    RegistryError,
)
from .expressions import EXPR_OPS, get_available_operators
from .refs import get_path
from .registry import Registry
from .resolver import Resolver
from .runner import Runner
from .types import (
    Context,
    ErrorInfo,
    GraphDefinition,
    NodeDefinition,
    ProgressCallback,
    ProgressEvent,
    Result,
)

__all__ = [
    # Core execution
    "Runner",
    "Resolver",
    "Registry",
    # Types
    "Context",
    "ErrorInfo",
    "GraphDefinition",
    "NodeDefinition",
    "ProgressCallback",
    "ProgressEvent",
    "Result",
    # Constants
    "ControlOp",
    "ErrorCode",
    "NodeType",
    "Operation",
    # Exceptions
    "AgentError",
    "ApiCallError",
    "ConfigurationError",
    "ExpressionError",
    "NodeExecutionError",
    "PlannerError",
    "ProviderError",
    "RegistryError",
    # Utilities
    "EXPR_OPS",
    "get_available_operators",
    "get_path",
]
