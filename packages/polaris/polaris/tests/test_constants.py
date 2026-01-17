"""Tests for constants module."""

from polaris.modules.constants import (
    ControlOp,
    ErrorCode,
    MAX_NODES,
    NodeType,
    Operation,
)


class TestNodeType:
    def test_all_node_types_defined(self):
        expected = ["compute", "control", "executor", "planner", "reasoning", "terminal"]
        for node_type in expected:
            assert node_type in [n.value for n in NodeType]

    def test_node_type_values(self):
        assert NodeType.COMPUTE == "compute"
        assert NodeType.CONTROL == "control"
        assert NodeType.EXECUTOR == "executor"
        assert NodeType.PLANNER == "planner"
        assert NodeType.REASONING == "reasoning"
        assert NodeType.TERMINAL == "terminal"

    def test_node_type_is_string_enum(self):
        assert isinstance(NodeType.COMPUTE, str)
        assert NodeType.COMPUTE == "compute"


class TestOperation:
    def test_all_operations_defined(self):
        expected = ["api.call", "system.agent.call", "system.wait"]
        for op in expected:
            assert op in [o.value for o in Operation]

    def test_operation_values(self):
        assert Operation.API_CALL == "api.call"
        assert Operation.AGENT_CALL == "system.agent.call"
        assert Operation.WAIT == "system.wait"


class TestControlOp:
    def test_branch_defined(self):
        assert ControlOp.BRANCH == "control.branch"


class TestErrorCode:
    def test_all_error_codes_defined(self):
        expected = [
            "unknown_node",
            "missing_start",
            "missing_agent",
            "subagent_failed",
            "unknown_executor_op",
            "unknown_node_type",
        ]
        for code in expected:
            assert code in [e.value for e in ErrorCode]

    def test_error_code_values(self):
        assert ErrorCode.UNKNOWN_NODE == "unknown_node"
        assert ErrorCode.MISSING_START == "missing_start"
        assert ErrorCode.MISSING_AGENT == "missing_agent"
        assert ErrorCode.SUBAGENT_FAILED == "subagent_failed"
        assert ErrorCode.UNKNOWN_EXECUTOR_OP == "unknown_executor_op"
        assert ErrorCode.UNKNOWN_NODE_TYPE == "unknown_node_type"


class TestMaxNodes:
    def test_max_nodes_value(self):
        assert MAX_NODES == 1000

    def test_max_nodes_is_int(self):
        assert isinstance(MAX_NODES, int)
