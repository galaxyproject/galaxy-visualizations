"""Constants for Polaris agent execution."""

from enum import Enum


class NodeType(str, Enum):
    """Types of nodes in an agent graph."""

    COMPUTE = "compute"
    CONTROL = "control"
    EXECUTOR = "executor"
    LOOP = "loop"
    MATERIALIZER = "materializer"
    PLANNER = "planner"
    REASONING = "reasoning"
    TERMINAL = "terminal"
    TRAVERSE = "traverse"


class Operation(str, Enum):
    """Operations that can be executed by executor nodes."""

    API_CALL = "api.call"
    AGENT_CALL = "system.agent.call"
    WAIT = "system.wait"


class ControlOp(str, Enum):
    """Control flow operations."""

    BRANCH = "control.branch"


class ErrorCode(str, Enum):
    """Error codes for runner failures."""

    UNKNOWN_NODE = "unknown_node"
    MISSING_START = "missing_start"
    MISSING_AGENT = "missing_agent"
    SUBAGENT_FAILED = "subagent_failed"
    UNKNOWN_EXECUTOR_OP = "unknown_executor_op"
    UNKNOWN_NODE_TYPE = "unknown_node_type"
    LOOP_INVALID_OVER = "loop_invalid_over"
    LOOP_ITERATION_FAILED = "loop_iteration_failed"
    MATERIALIZER_FAILED = "materializer_failed"
    MATERIALIZER_NOT_FOUND = "materializer_not_found"
    MATERIALIZER_INVALID_ARGS = "materializer_invalid_args"
    TRAVERSE_INVALID_CONFIG = "traverse_invalid_config"
    TRAVERSE_FETCH_FAILED = "traverse_fetch_failed"


# Graph execution limits
MAX_NODES = 1000
