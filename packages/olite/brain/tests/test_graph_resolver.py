"""Emit and loop context in the graph engine."""

import asyncio

from olite.drivers.graph.handlers.loop import LoopHandler
from olite.drivers.graph.resolver import Resolver
from olite.drivers.graph.runner import Runner


class EchoRegistry:
    async def call_api(self, ctx, spec):
        return {"ok": True, "result": spec["input"]}


def _runner(inputs):
    runner = Runner({"id": "g", "inputs": {}, "nodes": {}}, EchoRegistry())
    runner.state["inputs"] = inputs
    return runner


def test_append_emit_accumulates_across_applies():
    state = {}
    resolver = Resolver(state)
    for value in (1, 2):
        resolver.apply_emit({"state.seen": {"$append": "result"}}, {"result": value}, {})
    assert state["seen"] == [1, 2]


def _loop(runner, concurrency, when=None):
    node = {
        "over": {"$ref": "inputs.items"},
        "as": "item",
        "concurrency": concurrency,
        "execute": {"op": "api.call", "target": "t", "input": {"$ref": "loop.item"}},
        "emit": {"state.out": {"$append": "result"}},
    }
    if when is not None:
        node["when"] = when
    ctx = {"inputs": runner.state["inputs"], "state": runner.state, "run": {"flag": True}}
    return asyncio.run(LoopHandler().execute(node, ctx, runner.registry, runner))


def test_a_sequential_loop_appends_each_result_in_order():
    runner = _runner({"items": ["a", "b", "c"]})
    out = _loop(runner, concurrency=1)
    assert out["ok"] and runner.state["out"] == ["a", "b", "c"]


def test_a_concurrent_loop_keeps_order_and_sees_the_turn_context():
    # Each iteration used to get a context holding only `loop`, so a `when` reading the
    # run's context skipped every item.
    runner = _runner({"items": ["a", "b", "c"]})
    out = _loop(runner, concurrency=3, when={"$ref": "run.flag"})
    assert out["ok"] and runner.state["out"] == ["a", "b", "c"]
    assert "warnings" not in out
