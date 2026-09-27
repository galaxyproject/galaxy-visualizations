"""A graph node that could not run says so, in the engine's own vocabulary.

Four failures used to be invisible or mislabelled: a failing sub-agent raised KeyError, the node
ceiling returned the last node's result as if it were the answer, an emit naming a source the
payload lacked wrote None into state, and one handler used an error code the enum did not hold.
Each is asserted here against the runner rather than through a graph, so the contract is checked
where it is implemented.
"""

import asyncio

import pytest

from olit.drivers.graph import runner as runner_module
from olit.drivers.graph.constants import ErrorCode
from olit.drivers.graph.handlers.executor import ExecutorHandler
from olit.drivers.graph.resolver import Resolver
from olit.drivers.graph.runner import Runner
from olit.exceptions import NodeExecutionError


class _Resolver:
    def resolve(self, value, ctx):
        return value

    def apply_emit(self, *args):
        pass


class _Runner:
    resolver = _Resolver()


class _Agents:
    def __init__(self, graph):
        self._graph = graph

    def resolve_agent(self, agent_id):
        return self._graph


class _Registry:
    def __init__(self, graph=None):
        self.agents = _Agents(graph)


def _agent_call(child):
    node = {"run": {"op": "system.agent.call", "agent_id": "child", "input": {}}}
    return asyncio.run(ExecutorHandler().execute(node, {}, _Registry(child), _Runner()))


# --- G1: a failing sub-agent -------------------------------------------------


def test_a_sub_agent_that_failed_is_reported_not_raised():
    """It read `last["result"]` off a child that had none, so the parent died on KeyError."""
    out = _agent_call({"id": "child", "nodes": {}})  # no start node: fails immediately

    assert out["ok"] is False
    assert out["error"]["code"] == ErrorCode.SUBAGENT_FAILED
    assert out["error"]["details"]["agent_id"] == "child"
    # The child's own error is carried rather than replaced by a bare code.
    assert out["error"]["details"]["cause"]["code"] == ErrorCode.MISSING_START


def test_a_sub_agent_that_succeeded_passes_its_result_up():
    child = {"id": "child", "start": "end", "nodes": {"end": {"type": "terminal", "output": {"v": 1}}}}
    out = _agent_call(child)

    assert out["ok"] is True
    assert out["result"] == {"v": 1}


# --- G2: the node ceiling ----------------------------------------------------


def test_reaching_the_node_limit_is_reported_as_exhaustion():
    """Not as a cycle: a long walk reaches the ceiling too. Either way the walk stopped short, so
    the last node's result is not the graph's answer."""
    graph = {
        "id": "walker",
        "start": "a",
        "nodes": {"a": {"type": "terminal", "output": {"done": True}, "next": "a"}},
    }
    limit = 5
    original = runner_module.MAX_NODES
    runner_module.MAX_NODES = limit
    try:
        out = asyncio.run(Runner(graph, _Registry()).run({}))
    finally:
        runner_module.MAX_NODES = original

    assert out["last"]["ok"] is False
    assert out["last"]["error"]["code"] == ErrorCode.NODE_LIMIT_EXHAUSTED
    assert out["last"]["error"]["details"] == {"nodes_executed": limit, "next_node": "a"}
    # The state it did build is still handed back, so a caller can see how far it got.
    assert out["state"]["output"] == {"done": True}


def test_a_graph_that_ends_on_its_own_reports_its_last_node():
    graph = {"id": "short", "start": "a", "nodes": {"a": {"type": "terminal", "output": {"done": True}}}}

    out = asyncio.run(Runner(graph, _Registry()).run({}))

    assert out["last"]["ok"] is True
    assert out["last"]["result"] == {"done": True}


# --- G3: an emit naming a source that is not there ---------------------------


def test_an_emit_source_the_payload_lacks_fails_instead_of_writing_none():
    state: dict = {}

    with pytest.raises(NodeExecutionError) as raised:
        Resolver(state).apply_emit({"state.values": "reslt"}, {"result": [1, 2, 3]}, {})

    assert "reslt" in raised.value.message
    assert raised.value.details["available"] == ["result"]
    # And nothing half-written: the key is not created at all.
    assert state == {}


def test_an_emit_source_the_payload_has_is_copied():
    state: dict = {}

    Resolver(state).apply_emit({"state.values": "result"}, {"result": [1, 2, 3]}, {})

    assert state == {"values": [1, 2, 3]}


def test_a_node_that_cannot_run_becomes_a_failed_node_not_a_crashed_graph():
    """The emit failure above reaches the caller as the engine's own coded result."""

    class _Handler:
        async def execute(self, node, ctx, registry, runner):
            runner.resolver.apply_emit({"state.x": "nope"}, {"result": 1}, ctx)
            return {"ok": True}

    graph = {"id": "bad-emit", "start": "a", "nodes": {"a": {"type": "compute"}}}
    run = Runner(graph, _Registry())
    res, _ = asyncio.run(run.run_node("a", graph["nodes"]["a"]))

    # The real compute handler emits nothing, so the failure is driven through a stand-in.
    assert res["ok"] is True

    original = runner_module.get_handler
    runner_module.get_handler = lambda node_type: _Handler()
    try:
        res, _ = asyncio.run(run.run_node("a", graph["nodes"]["a"]))
    finally:
        runner_module.get_handler = original

    assert res["ok"] is False
    assert res["error"]["code"] == ErrorCode.NODE_EXECUTION_FAILED
    assert res["error"]["node_id"] == "a"
    assert res["error"]["details"]["available"] == ["result"]


# --- G4: every code a handler reports is in the enum -------------------------


def test_every_error_code_a_handler_reports_is_in_the_enum():
    """One handler used the bare string "reasoning_failed", which no consumer of ErrorCode could
    match on. The enum is the vocabulary, so the check is that nothing invents a word."""
    import ast
    import pathlib

    from olit.drivers.graph import handlers

    known = {member.value for member in ErrorCode}
    handler_dir = pathlib.Path(handlers.__file__).parent
    invented = []
    for path in sorted(handler_dir.glob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Dict):
                continue
            for key, value in zip(node.keys, node.values):
                named_code = isinstance(key, ast.Constant) and key.value == "code"
                if named_code and isinstance(value, ast.Constant) and value.value not in known:
                    invented.append(f"{path.name}: {value.value!r}")
    assert not invented, f"error codes outside ErrorCode: {invented}"
