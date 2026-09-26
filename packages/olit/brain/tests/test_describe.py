"""The description olit publishes about itself."""

import json
import pathlib

from olit import describe
from olit.drivers.loop import galaxy_tools

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
    assert set(tool) == {"capability", "runner", "signature", "params", "prose", "query", "passthrough"}


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
    assert "olit/runtime.py" in symbols and "olit/drivers/loop/galaxy_tools.py" in symbols
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


def test_the_shell_contract_a_harness_stands_in_for_is_published():
    shell = described()["shell"]
    assert shell["max_auto_follow_ups"] == 3
    assert shell["resume_prompt"].startswith("[Olit automatic Galaxy follow-up]")
