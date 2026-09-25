"""olit serves galaxy-mcp's tool descriptions; this states where it deliberately does not.

The brain does not depend on galaxy-mcp -- it runs in Pyodide and reaches Galaxy over HTTP --
so the reference is a snapshot of the version olit is written against. Refresh it with
`make galaxy-mcp-docs` when moving to a new galaxy-mcp, and the diff shows what upstream
changed rather than leaving it to be found in an eval months later.
"""

import json
import pathlib

from olit.drivers.loop.galaxy_tool_docs import DOCS

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
    "recommend_biocontainer": "resolves through the quay.io tag listing; mulled cannot run in Pyodide",
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
