"""The description olit publishes about itself."""

import json
import pathlib

import describe
import pytest
from olit.loop import galaxy_tools

ROOT = pathlib.Path(__file__).resolve().parents[2]


def described():
    return describe.describe(ROOT)


def test_the_description_is_json_and_names_its_schema():
    doc = described()
    assert doc["schema"] == describe.SCHEMA
    assert doc["agent"] == "olit"
    json.dumps(doc)


def test_every_tool_the_model_is_shown_is_described():
    doc = described()
    assert set(doc["tools"]) == {t["name"] for t in galaxy_tools.TOOLS}


def test_a_tool_carries_its_contract_and_the_query_it_builds():
    tool = described()["tools"]["get_job_details"]
    assert tool["capability"] == "read"
    assert tool["query"]["full"] is True
    assert set(tool) == {
        "capability",
        "runner",
        "signature",
        "params",
        "prose",
        "query",
        "passthrough",
        "promised_fields",
    }


def test_no_operation_olit_still_runs_itself_only_forwards_it():
    """Forwarding is what galaxy-ops does; a handler that stayed here shapes its result."""
    tools = described()["tools"]
    assert [n for n, t in tools.items() if t["passthrough"]] == []


def test_a_delegated_tool_says_galaxy_ops_runs_it_and_claims_no_query():
    tools = described()["tools"]
    assert tools["get_histories"]["runner"] == "galaxy-ops"
    assert tools["get_histories"]["query"] == {} and tools["get_histories"]["passthrough"] is False
    assert tools["get_history_contents"]["runner"] == "olit"


def test_prompt_blocks_are_symbols_the_prompt_module_defines():
    doc = described()
    assert doc["prompt_blocks"]
    assert set(doc["prompt_blocks"]) <= set(doc["symbols"]["olit/prompt.py"])


def test_the_symbol_table_covers_the_package_and_skips_vendored_contracts():
    symbols = described()["symbols"]
    assert "olit/runtime.py" in symbols and "olit/loop/galaxy_tools.py" in symbols
    assert not [m for m in symbols if m.startswith("olit/vendor/")]


def test_policy_reports_the_loop_bounds_and_the_guards_that_refuse():
    policy = described()["policy"]
    assert policy["loop"]["max_steps"] and policy["loop"]["max_tool_result_bytes"]
    assert policy["guards"] == sorted(set(policy["guards"])) and policy["guards"]
    assert "max_tokens" in policy["llm_request"]["sampling"]


def test_the_identity_prompt_is_read_from_the_plugin_manifest():
    assert described()["identity_prompt"]["fingerprint"]


def test_describing_twice_gives_the_same_answer():
    assert described() == described()


@pytest.mark.skipif(not describe.strips_types(), reason="the shell contract needs a node that reads TypeScript")
def test_the_shell_contract_a_harness_stands_in_for_is_published():
    shell = described()["shell"]
    assert shell["max_auto_follow_ups"] == 3
    assert shell["resume_prompt_from"] == "contract/shell.mjs"


def test_the_published_request_shows_that_tool_choice_is_left_to_the_provider():
    """Invisible until the probe attached a tool, which is how an imposed default went unseen."""
    assert described()["policy"]["llm_request"]["with_tools"] == {"tool_choice": None}


def test_a_handler_outside_galaxy_tools_still_carries_its_query():
    """The visualization handlers live in their own module; their metadata has to follow them.

    Discovery reads each handler's own module, so an extraction cannot silently leave a tool
    with an empty query and passthrough False while every other check still passes.
    """
    tools = described()["tools"]
    assert tools["save_visualization"]["query"] == {"visualization": None, "visualization_id": None}
    assert tools["show_visualization"]["query"] == {"dataset_id": None, "visualization": None}
    assert tools["list_visualizations"]["query"] == {"dataset_id": None}


def test_discovery_spans_every_module_that_defines_a_handler():
    """Named by the handlers themselves rather than a list that can go stale."""
    modules = {t["handler"].__module__ for t in galaxy_tools.TOOLS if t["handler"] is not None}
    assert len(modules) > 1, "the split put handlers in more than one module"
    assert modules == {"olit.loop.galaxy_tools", "olit.loop.visualizations"}
    assert len(describe._handler_trees()) == len(modules)


def test_every_tool_with_a_local_handler_is_parsed_from_somewhere():
    """A handler whose module discovery missed would report no query at all."""
    trees = describe._handler_trees()
    import ast

    defined = {
        node.name
        for tree in trees
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for tool in galaxy_tools.TOOLS:
        if tool["handler"] is not None:
            assert tool["handler"].__name__ in defined, tool["name"]
