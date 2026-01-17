"""Type definitions for Polaris agent execution.

Provides type aliases and TypedDict definitions for better type safety
while maintaining flexibility for dynamic data.
"""

from typing import Any, Callable, TypedDict

# Flexible type aliases for structures with dynamic/optional fields
# These are used where the exact shape varies by context
Context = dict[str, Any]
"""Execution context passed to handlers. Contains inputs, state, nodeId, graphId, etc."""

Result = dict[str, Any]
"""Result from node execution. Contains ok, result, error, warnings, etc."""

NodeDefinition = dict[str, Any]
"""Node configuration from agent YAML. Fields vary by node type."""

GraphDefinition = dict[str, Any]
"""Agent graph configuration. Contains id, version, start, nodes, etc."""


class ErrorInfo(TypedDict, total=False):
    """Error information returned from failed operations."""

    code: str
    message: str
    node_id: str
    details: dict[str, Any]


class ProgressEvent(TypedDict):
    """Progress event emitted during graph execution."""

    node_id: str
    node_type: str
    status: str
    detail: str


# Callback type for progress events
ProgressCallback = Callable[[ProgressEvent], None]


# Re-export for convenience
__all__ = [
    "Context",
    "ErrorInfo",
    "GraphDefinition",
    "NodeDefinition",
    "ProgressCallback",
    "ProgressEvent",
    "Result",
]
