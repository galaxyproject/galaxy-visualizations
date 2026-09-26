"""olit serves galaxy-mcp's tool descriptions; this states where it deliberately does not.

The brain does not depend on galaxy-mcp -- it runs in Pyodide and reaches Galaxy over HTTP --
so the reference is a snapshot of the version olit is written against. Refresh it with
`make galaxy-mcp-docs` when moving to a new galaxy-mcp, and the diff shows what upstream
changed rather than leaving it to be found in an eval months later.
"""

import asyncio
import json
import os
import pathlib
import re
import shutil

import pytest

from olit.drivers.loop.galaxy_tool_docs import DOCS
from olit.drivers.loop.galaxy_tools import TOOLS
from olit.substrate.substrate import Substrate

REFERENCE = pathlib.Path(__file__).parent / "data" / "galaxy-mcp-docs.json"

# Tools galaxy-mcp registers that olit deliberately does not, and why. Anything upstream
# adds outside this list is a gap to close or a decision to record, not something to
# discover months later from a scenario.
NOT_PORTED = {
    "connect": "hands galaxy-mcp a url and an api key; olit inherits the browser session",
}

# Tools whose description olit rewrites, and why. Anything not listed must match upstream.
DIVERGES = {
    "download_dataset": "writes to the browser's in-memory filesystem and reports the format Galaxy parsed",
    "upload_file": "reads the browser's in-memory filesystem and sends pasted content",
    "get_tool_panel": "returns tool_count and section_count, which galaxy-mcp does not",
    "get_workflow_input_template": "documents the step annotation and default value olit adds to each slot",
    "recommend_biocontainer": "resolves through the quay.io tag listing; mulled cannot run in Pyodide",
}


# Parameters that differ from galaxy-mcp, and why, one entry per parameter name. Argument
# names are compared whether or not the description is declared in DIVERGES, so a capability
# olit drops stays visible even where the prose is ours to write.
PARAMETERS = {
    "download_dataset": {
        "file_path": "there is no filesystem path to write to; the bytes come back in the result",
        "use_default_filename": "no file is written, so there is no filename to default to",
        "require_ok_state": "olit always refuses a dataset that is not ok; callers cannot turn it off",
    },
    "get_tool_panel": {
        "section_id": "opens one section, because the whole panel does not fit the context window",
        "limit": "pages the panel for the same reason",
        "offset": "pages the panel for the same reason",
    },
    "get_iwc_workflows": {
        "limit": "pages the IWC list, whose raw entries carry whole workflow definitions",
        "offset": "pages the IWC list for the same reason",
    },
    "list_workflows": {
        "limit": "pages a long workflow list",
        "offset": "pages a long workflow list",
    },
    "update_page": {
        "expect_hash": "refuses an edit written against content the record has since moved past",
        "section_heading": "edits one section, so a long record need not be rewritten whole",
        "section_content": "edits one section, so a long record need not be rewritten whole",
    },
    "upload_file": {
        "file_type": "upstream takes these on upload_file_from_url only; pasted uploads accept them too",
        "dbkey": "upstream takes these on upload_file_from_url only; pasted uploads accept them too",
        "file_name": "names the dataset, which otherwise falls back to the basename",
    },
}


def reference():
    return json.loads(REFERENCE.read_text())


def test_every_description_olit_serves_exists_upstream():
    missing = sorted(set(DOCS) - set(reference()["docs"]))
    assert not missing, f"olit documents tools galaxy-mcp does not: {missing}"


def test_olit_serves_every_tool_galaxy_mcp_registers():
    """The check recommend_biocontainer needed: it shipped upstream and we did not notice."""
    upstream = set(reference()["docs"])
    absent = sorted(upstream - set(DOCS) - set(NOT_PORTED))
    assert not absent, (
        f"galaxy-mcp {reference()['version']} registers tools olit does not serve: {absent}. "
        "Port them, or add each to NOT_PORTED with the reason olit omits it."
    )


def test_every_not_ported_tool_is_really_absent_and_really_upstream():
    """A stale entry would exempt a tool olit has since ported, or one upstream dropped."""
    upstream = set(reference()["docs"])
    ported = sorted(set(NOT_PORTED) & set(DOCS))
    assert not ported, f"NOT_PORTED names tools olit does serve; drop them: {ported}"
    gone = sorted(set(NOT_PORTED) - upstream)
    assert not gone, f"NOT_PORTED names tools galaxy-mcp no longer registers; drop them: {gone}"


def test_descriptions_match_galaxy_mcp_unless_declared_otherwise():
    upstream = reference()["docs"]
    drifted = [
        name for name, text in sorted(DOCS.items()) if name not in DIVERGES and text.strip() != upstream[name].strip()
    ]
    assert not drifted, (
        f"these drifted from galaxy-mcp {reference()['version']}: {drifted}. "
        "Re-copy the docstring, or add it to DIVERGES with the reason olit differs."
    )


def test_every_declared_divergence_actually_diverges():
    """A stale entry here would silently exempt a description that no longer differs."""
    upstream = reference()["docs"]
    same = [name for name in DIVERGES if DOCS[name].strip() == upstream[name].strip()]
    assert not same, f"these no longer differ from upstream; drop them from DIVERGES: {same}"


def test_the_divergence_list_names_only_tools_olit_serves():
    unknown = sorted(set(DIVERGES) - set(DOCS))
    assert not unknown, f"DIVERGES names tools olit does not document: {unknown}"


def test_a_user_defined_tool_is_not_run_with_run_tool():
    """The pair that sent an agent to the wrong tool and to a bare image."""
    doc = DOCS["create_user_tool"]
    assert "run_user_tool(history_id, tool_uuid" in doc
    assert "ships no third-party libraries" in doc


def olit_parameters():
    """The argument names olit declares to the model, per tool."""
    return {tool["name"]: set(tool["schema"]["function"]["parameters"]["properties"]) for tool in TOOLS}


def shared_tools():
    upstream = reference()["params"]
    return upstream, olit_parameters(), sorted(set(upstream) & set(olit_parameters()))


def test_parameters_match_galaxy_mcp_unless_each_one_is_declared():
    """download_dataset dropped require_ok_state inside a declared divergence and nothing saw it."""
    upstream, ours, shared = shared_tools()
    undeclared = {
        name: sorted((set(upstream[name]) ^ ours[name]) - set(PARAMETERS.get(name) or ()))
        for name in shared
        if (set(upstream[name]) ^ ours[name]) - set(PARAMETERS.get(name) or ())
    }
    assert not undeclared, (
        f"these parameters differ from galaxy-mcp {reference()['version']} undeclared: {undeclared}. "
        "Match upstream, or name each one in PARAMETERS with the reason olit differs."
    )


def test_every_declared_parameter_really_differs():
    """A stale entry would exempt a parameter that has since come back into line."""
    upstream, ours, shared = shared_tools()
    agreed = {
        name: sorted(set(params) - (set(upstream[name]) ^ ours[name]))
        for name, params in PARAMETERS.items()
        if name in shared and set(params) - (set(upstream[name]) ^ ours[name])
    }
    assert not agreed, f"these no longer differ from upstream; drop them from PARAMETERS: {agreed}"


def test_the_parameter_list_names_only_tools_both_sides_serve():
    _, _, shared = shared_tools()
    unknown = sorted(set(PARAMETERS) - set(shared))
    assert not unknown, f"PARAMETERS names tools galaxy-mcp and olit do not both serve: {unknown}"


# ---------------------------------------------------------------------------
# What a description promises the result will hold.
#
# olit serves galaxy-mcp's descriptions but no longer produces most results itself, so a
# description can promise a field the delegated implementation does not return. That is
# invisible to every check above -- they compare descriptions and argument names, never
# what comes back. `get_tool_panel` promised `tool_count` for a release after the
# delegated implementation stopped returning it, and a scenario found it, not a test.
# ---------------------------------------------------------------------------

# Backticked lowercase identifiers are how these descriptions name a field.
FIELD_MENTION = re.compile(r"`([a-z_][a-z0-9_]{2,})`")
# Prose, not field names.
NOT_FIELDS = {"data", "true", "false", "none", "null"}

# Top-level fields of `data` that a delegated tool's description tells the model to read.
# Adding one here means the live check below must be able to reach it.
PROMISED_FIELDS = {
    "get_tool_panel": ("tool_count", "section_count"),
}

# Every other field a delegated description names, and why it is not a top-level promise.
# A mention that is in neither table fails the exhaustiveness test, so delegating a tool or
# rewriting a description forces the question instead of leaving it to a scenario.
NOT_A_TOP_LEVEL_PROMISE = {
    ("get_tool_panel", "panel"): "olit keys the hierarchy `entries`; upstream's wording predates that",
    ("get_page_revision", "content"): "a field of the revision returned, not of the envelope",
    ("get_page_revision", "content_editor"): "named to say a revision does not carry one",
    ("get_page_revision", "edit_source"): "a field of the revision returned",
    ("get_tool_input_template", "inputs"): "names run_tool's argument, not a field of this result",
    ("list_page_revisions", "edit_source"): "a field of each revision in the list",
    ("get_workflow_input_template", "inputs_template"): "covered by the workflow template tests upstream",
    ("get_workflow_input_template", "guide"): "covered by the workflow template tests upstream",
    ("get_workflow_input_template", "warnings"): "covered by the workflow template tests upstream",
    ("get_workflow_input_template", "annotation"): "a field of a slot, not of the envelope",
    ("get_workflow_input_template", "history_id"): "a field of a slot, not of the envelope",
    ("get_workflow_input_template", "options"): "a field of a slot, not of the envelope",
    ("get_workflow_input_template", "value"): "a field of a slot, not of the envelope",
}


def delegated_tools():
    return [t["name"] for t in TOOLS if t["handler"] is None]


def mentioned_fields(name):
    return {f for f in FIELD_MENTION.findall(DOCS.get(name, "")) if f not in NOT_FIELDS}


def test_every_field_a_delegated_description_names_is_classified():
    """A promised field is either checked below or written down as not being one."""
    unclassified = sorted(
        (name, field)
        for name in delegated_tools()
        for field in mentioned_fields(name)
        if field not in PROMISED_FIELDS.get(name, ()) and (name, field) not in NOT_A_TOP_LEVEL_PROMISE
    )
    assert not unclassified, (
        f"these delegated descriptions name a field nothing accounts for: {unclassified}. "
        "Add it to PROMISED_FIELDS so the live check reads it back, or to "
        "NOT_A_TOP_LEVEL_PROMISE with the reason it is not a promise about the envelope."
    )


def test_a_promised_field_is_really_named_in_the_description():
    """A stale entry would have the live check assert a promise nothing makes."""
    unpromised = sorted(
        (name, field)
        for name, fields in PROMISED_FIELDS.items()
        for field in fields
        if field not in mentioned_fields(name)
    )
    assert not unpromised, f"these are not named in the description any more; drop them: {unpromised}"


def test_the_promised_fields_name_only_delegated_tools():
    """A tool olit still runs itself is covered by its own handler's tests."""
    unknown = sorted(set(PROMISED_FIELDS) - set(delegated_tools()))
    assert not unknown, f"PROMISED_FIELDS names tools olit runs itself: {unknown}"


# The arguments each promised-field check calls with. A tool in PROMISED_FIELDS without a
# case here is a promise nothing reads back, which is the hole this whole section exists to
# close, so the pairing is asserted rather than assumed.
LIVE_CASES = {
    "get_tool_panel": {},
}


def test_every_promised_field_has_a_way_to_read_it_back():
    missing = sorted(set(PROMISED_FIELDS) - set(LIVE_CASES))
    assert not missing, f"promised with no live case, so nothing checks it: {missing}"


def _live_galaxy():
    """The Galaxy a live check may use, or None; the delegated path needs node to reach it."""
    root = os.environ.get("GALAXY_URL", "").strip()
    return root if root and shutil.which("node") else None


@pytest.mark.skipif(_live_galaxy() is None, reason="needs GALAXY_URL and node: it reads a real result back")
def test_a_delegated_result_carries_every_field_its_description_promises():
    """The check the description-only tests cannot make: ask the runtime and read it back.

    This is the one that would have caught get_tool_panel. Everything above compares olit's
    words against galaxy-mcp's words; only this compares olit's words against what the
    delegated implementation actually returns.
    """
    substrate = Substrate(
        {
            "galaxy_root": _live_galaxy(),
            "galaxy_key": os.environ.get("GALAXY_API_KEY") or os.environ.get("GALAXY_LOCAL_KEY", ""),
            "capabilities": {"read": True, "write": True},
        }
    )

    async def collect():
        found = {}
        for name, args in LIVE_CASES.items():
            envelope, refusal = await substrate.ops.run(name, args, "read")
            found[name] = (envelope or {}).get("data") if not refusal else refusal
        await substrate.ops._transports[1].close()
        return found

    results = asyncio.run(collect())
    broken = []
    for name, promised in PROMISED_FIELDS.items():
        data = results[name]
        if not isinstance(data, dict):
            broken.append(f"{name}: no result to read ({str(data)[:80]})")
            continue
        for field in promised:
            if field not in data:
                broken.append(f"{name}.{field}: promised by the description, absent from the result")
    assert not broken, "\n".join(broken)
