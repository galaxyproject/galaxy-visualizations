"""Tests for handler registry."""

from polaris.modules.constants import NodeType
from polaris.modules.handlers import HANDLERS, get_handler


class TestGetHandler:
    def test_get_known_handlers(self):
        assert get_handler(NodeType.COMPUTE) is not None
        assert get_handler(NodeType.CONTROL) is not None
        assert get_handler(NodeType.EXECUTOR) is not None
        assert get_handler(NodeType.LOOP) is not None
        assert get_handler(NodeType.PLANNER) is not None
        assert get_handler(NodeType.REASONING) is not None
        assert get_handler(NodeType.TERMINAL) is not None

    def test_get_unknown_handler(self):
        assert get_handler("unknown") is None

    def test_handlers_registry_complete(self):
        for node_type in NodeType:
            assert node_type in HANDLERS, f"Missing handler for {node_type}"
