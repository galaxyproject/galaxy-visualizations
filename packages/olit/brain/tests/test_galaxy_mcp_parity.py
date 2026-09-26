"""olit serves galaxy-mcp's tool descriptions; this states where it deliberately does not.

The brain does not depend on galaxy-mcp -- it runs in Pyodide and reaches Galaxy over HTTP --
so the reference is a snapshot of the version olit is written against. Refresh it with
`make galaxy-mcp-docs` when moving to a new galaxy-mcp, and the diff shows what upstream
changed rather than leaving it to be found in an eval months later.
"""

import json
import pathlib

from olit.drivers.loop.galaxy_tool_docs import DOCS
from olit.drivers.loop.galaxy_tools import TOOLS

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
