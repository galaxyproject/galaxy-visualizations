"""A `$ref` that is not there is a fault; a `$ref` to a null is a null.

`get_path` used to answer None for three different situations: an unknown namespace, a path that
stops partway, and a path holding null. A graph could read a typo and get the same answer as reading
an unset value, and the operators downstream turned that None into an empty list or a zero,
reporting a count over data they had never read. The two are separate now: a path the graph can walk
yields its value, null included, and anything else raises NodeExecutionError, which the runner turns
into a failed node rather than a crashed graph.
"""

import asyncio

import pytest

from olit.drivers.graph.constants import ErrorCode
from olit.drivers.graph.refs import get_path
from olit.drivers.graph.resolver import Resolver
from olit.drivers.graph.runner import Runner
from olit.exceptions import ExpressionError, NodeExecutionError


class _Registry:
    agents = None


# --- the reference itself -----------------------------------------------------


def test_a_path_that_holds_null_resolves_to_null():
    assert get_path("state.transformed", {}, {"transformed": None}) is None


def test_a_state_key_that_was_never_written_is_a_fault():
    with pytest.raises(NodeExecutionError) as raised:
        get_path("state.transfomed", {}, {"transformed": None})

    assert raised.value.details["available"] == ["transformed"]
    assert raised.value.details["resolved"] == "state"


def test_an_unknown_namespace_is_a_fault_rather_than_a_warning():
    with pytest.raises(NodeExecutionError) as raised:
        get_path("statte.values", {}, {})

    assert raised.value.details["namespace"] == "statte"
    assert "state" in raised.value.details["available"]


def test_a_namespace_this_node_does_not_have_is_a_fault():
    """`result` exists only once a handler has produced one; before that, reading it is a fault."""
    with pytest.raises(NodeExecutionError):
        get_path("result.values", {}, {})

    assert get_path("result.values", {"result": {"values": None}}, {}) is None


def test_a_path_walking_into_a_non_mapping_names_what_it_found():
    with pytest.raises(NodeExecutionError) as raised:
        get_path("state.rows.name", {}, {"rows": [{"name": "a"}]})

    assert raised.value.details["found"] == "list"
    assert raised.value.details["resolved"] == "state.rows"


def test_a_null_further_down_a_path_is_still_a_fault_to_read_through():
    with pytest.raises(NodeExecutionError) as raised:
        get_path("state.profile.fields", {}, {"profile": None})

    assert raised.value.details["found"] == "null"


# --- what the graph sees -----------------------------------------------------


def test_a_declared_state_key_is_null_before_it_is_written():
    """The `state:` block is what makes a null readable: declared is null, undeclared is a fault."""
    graph = {
        "id": "declares",
        "start": "end",
        "state": {"transformed": {"type": "boolean"}},
        "nodes": {"end": {"type": "terminal", "output": {"seen": {"$ref": "state.transformed"}}}},
    }

    out = asyncio.run(Runner(graph, _Registry()).run({}))

    assert out["last"]["ok"] is True
    assert out["last"]["result"] == {"seen": None}


def test_a_ref_to_an_undeclared_key_fails_the_node_rather_than_the_graph():
    graph = {
        "id": "typo",
        "start": "end",
        "state": {"transformed": {"type": "boolean"}},
        "nodes": {"end": {"type": "terminal", "output": {"seen": {"$ref": "state.transfomed"}}}},
    }

    out = asyncio.run(Runner(graph, _Registry()).run({}))

    assert out["last"]["ok"] is False
    assert out["last"]["error"]["code"] == ErrorCode.NODE_EXECUTION_FAILED
    assert out["last"]["error"]["details"]["path"] == "state.transfomed"
    # State still comes back, so a caller can see what the graph had built.
    assert out["state"]["transformed"] is None


def test_appending_to_a_declared_key_starts_it_as_a_list():
    """Seeding declared keys with null must not make `$append` silently drop its first value."""
    state: dict = {"log": None}
    resolver = Resolver(state)

    resolver.apply_emit({"state.log": {"$append": "result"}}, {"result": "a"}, {})
    resolver.apply_emit({"state.log": {"$append": "result"}}, {"result": "b"}, {})

    assert state["log"] == ["a", "b"]


def test_appending_to_a_key_that_holds_something_else_is_a_fault():
    state: dict = {"log": "not a list"}

    with pytest.raises(NodeExecutionError) as raised:
        Resolver(state).apply_emit({"state.log": {"$append": "result"}}, {"result": "a"}, {})

    assert raised.value.details["found"] == "str"


# --- the operators, once missing can no longer reach them --------------------


def _expr(expr, state=None, ctx=None):
    return Resolver(state if state is not None else {}).eval_expr(expr, ctx or {})


def test_a_null_source_is_the_empty_collection():
    state = {"items": None}
    assert _expr({"op": "len", "arg": {"$ref": "state.items"}}, state) == 0
    assert _expr({"op": "count_where", "from": {"$ref": "state.items"}, "field": "a", "equals": 1}, state) == 0
    assert _expr({"op": "any", "from": {"$ref": "state.items"}, "field": "a", "equals": 1}, state) is False
    assert _expr({"op": "filter", "from": {"$ref": "state.items"}, "where": {"field": "a", "eq": 1}}, state) == []
    assert _expr({"op": "unique", "from": {"$ref": "state.items"}, "by": "a"}, state) == []
    assert _expr({"op": "select", "from": {"$ref": "state.items"}, "fields": ["a"]}, state) == []


@pytest.mark.parametrize(
    "expr",
    [
        {"op": "count_where", "from": {"$ref": "state.items"}, "field": "a", "equals": 1},
        {"op": "any", "from": {"$ref": "state.items"}, "field": "a", "equals": 1},
        {"op": "filter", "from": {"$ref": "state.items"}, "where": {"field": "a", "eq": 1}},
        {"op": "unique", "from": {"$ref": "state.items"}, "by": "a"},
        {"op": "select", "from": {"$ref": "state.items"}, "fields": ["a"]},
        {"op": "lookup", "from": {"$ref": "state.items"}, "match": {"field": "a", "equals": 1}, "select": "b"},
    ],
)
def test_a_source_of_the_wrong_type_is_a_fault_not_an_empty_answer(expr):
    """Answering 0 or [] for a dict where a list was meant reported on data never read."""
    with pytest.raises(ExpressionError) as raised:
        _expr(expr, {"items": {"a": 1}})

    assert raised.value.received == "dict"


def test_a_source_that_is_not_there_never_reaches_an_operator():
    with pytest.raises(NodeExecutionError):
        _expr({"op": "len", "arg": {"$ref": "state.itmes"}}, {"items": []})


def test_get_reads_a_null_object_as_having_no_key_and_refuses_a_non_object():
    assert _expr({"op": "get", "obj": {"$ref": "state.p"}, "key": "x", "default": 7}, {"p": None}) == 7

    with pytest.raises(ExpressionError) as raised:
        _expr({"op": "get", "obj": {"$ref": "state.p"}, "key": "x", "default": 7}, {"p": [1, 2]})

    assert raised.value.parameter == "obj"


def test_coalesce_falls_through_an_explicit_null_but_not_a_missing_path():
    state = {"a": None, "b": "second"}
    assert _expr({"op": "coalesce", "args": [{"$ref": "state.a"}, {"$ref": "state.b"}]}, state) == "second"

    with pytest.raises(NodeExecutionError):
        _expr({"op": "coalesce", "args": [{"$ref": "state.zzz"}, {"$ref": "state.b"}]}, state)


def test_unique_treats_a_null_key_as_a_value_rather_than_dropping_the_item():
    items = [{"id": None, "n": 1}, {"id": None, "n": 2}, {"id": "x", "n": 3}]

    out = _expr({"op": "unique", "from": {"$ref": "state.items"}, "by": "id"}, {"items": items})

    assert [row["n"] for row in out] == [1, 3]


def test_filter_reads_its_where_clause_even_when_there_is_nothing_to_walk():
    """The clause was only recognised inside the item loop, so filtering nothing raised."""
    out = _expr({"op": "filter", "from": {"$ref": "state.items"}, "where": {"field": "a", "eq": 1}}, {"items": []})
    assert out == []


def test_filter_still_refuses_a_where_clause_with_no_comparison():
    with pytest.raises(ExpressionError) as raised:
        _expr({"op": "filter", "from": {"$ref": "state.items"}, "where": {"field": "a"}}, {"items": [{"a": 1}]})

    assert raised.value.parameter == "where"
