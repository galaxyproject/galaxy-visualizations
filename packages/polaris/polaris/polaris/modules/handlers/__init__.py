"""Node handlers for agent graph execution."""

from ..constants import NodeType
from ..types import Context, NodeDefinition, Result
from .base import NodeHandler
from .compute import ComputeHandler
from .control import ControlHandler
from .executor import ExecutorHandler
from .loop import LoopHandler
from .planner import PlannerHandler
from .reasoning import ReasoningHandler
from .terminal import TerminalHandler
from .traverse import TraverseHandler

# Handler classes (not instances) - instantiated lazily
_HANDLER_CLASSES: dict[str, type[NodeHandler]] = {
    NodeType.COMPUTE: ComputeHandler,
    NodeType.CONTROL: ControlHandler,
    NodeType.EXECUTOR: ExecutorHandler,
    NodeType.LOOP: LoopHandler,
    NodeType.PLANNER: PlannerHandler,
    NodeType.REASONING: ReasoningHandler,
    NodeType.TERMINAL: TerminalHandler,
    NodeType.TRAVERSE: TraverseHandler,
}

# Cached handler instances
_handler_cache: dict[str, NodeHandler] = {}


def get_handler(node_type: str) -> NodeHandler | None:
    """Get the handler for a node type (lazily instantiated)."""
    if node_type in _handler_cache:
        return _handler_cache[node_type]

    handler_class = _HANDLER_CLASSES.get(node_type)
    if handler_class is None:
        return None

    handler = handler_class()
    _handler_cache[node_type] = handler
    return handler


# For backward compatibility
HANDLERS = _HANDLER_CLASSES  # type: ignore[assignment]


__all__ = [
    # Types
    "Context",
    "NodeDefinition",
    "NodeHandler",
    "Result",
    # Handlers
    "ComputeHandler",
    "ControlHandler",
    "ExecutorHandler",
    "LoopHandler",
    "PlannerHandler",
    "ReasoningHandler",
    "TerminalHandler",
    "TraverseHandler",
    # Registry
    "HANDLERS",
    "get_handler",
]
