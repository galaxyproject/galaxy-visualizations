"""Olit's wiring of the shared input check into the two execution paths.

The semantics live in galaxy-agent-semantics and are tested there. What is tested here is
only what olit does with a verdict: a provable mismatch must not be submitted, and an input
set the checker could not read must still be.
"""

import asyncio

from olit.drivers.loop.galaxy_tools import _run_tool, _run_user_tool

CAT1 = {
    "id": "cat1",
    "name": "Concatenate",
    "inputs": [{"name": "input1", "type": "data", "multiple": False, "optional": False}],
}
UDT = {
    "tool_id": "my_filter",
    "representation": {
        "class": "GalaxyUserTool",
        "id": "my_filter",
        "inputs": [{"name": "input1", "type": "data", "multiple": False}],
    },
}


class Galaxy:
    """Records what was read and whether the run was submitted."""

    def __init__(self, schema=CAT1, udt=UDT, dataset_history="h1", fail_schema=False):
        self.schema, self.udt = schema, udt
        self.dataset_history, self.fail_schema = dataset_history, fail_schema
        self.gets, self.posted = [], None

    async def get(self, path):
        self.gets.append(path)
        if path.startswith("api/tools/"):
            if self.fail_schema:
                raise RuntimeError("HTTP 500")
            return self.schema
        if path.startswith("api/unprivileged_tools/"):
            return self.udt
        if path.startswith("api/datasets/") or path.startswith("api/dataset_collections/"):
            return {"history_id": self.dataset_history, "name": "thing"}
        return {}

    async def post(self, path, body):
        self.posted = (path, body)
        return {"jobs": [{"id": "j1"}]}

    def schema_reads(self):
        return [p for p in self.gets if p.startswith("api/tools/")]


def run(galaxy, inputs, tool="cat1"):
    return asyncio.run(_run_tool(galaxy, {"history_id": "h1", "tool_id": tool, "inputs": inputs}))


def run_udt(galaxy, inputs):
    return asyncio.run(_run_user_tool(galaxy, {"history_id": "h1", "tool_uuid": "u-1", "inputs": inputs}))


def test_accepted_inputs_are_submitted():
    g = Galaxy()
    out = run(g, {"input1": {"src": "hda", "id": "d1"}})
    assert g.posted is not None
    assert "inputs_not_pre_checked" not in out


def test_a_provable_mismatch_is_not_submitted():
    """A collection where the parameter takes one dataset; Galaxy would accept the request."""
    g = Galaxy()
    out = run(g, {"input1": {"src": "hdca", "id": "c1"}})
    assert g.posted is None
    assert out.is_error
    assert "input1" in out.content["error"]


def test_a_schema_that_cannot_be_read_still_submits():
    """Inability to preflight must never be what stops a valid run."""
    g = Galaxy(fail_schema=True)
    out = run(g, {"input1": {"src": "hda", "id": "d1"}})
    assert g.posted is not None
    assert "the input check for 'cat1' failed" in out["inputs_not_pre_checked"]


def test_a_schema_for_another_tool_still_submits():
    g = Galaxy(schema={"id": "other", "inputs": []})
    out = run(g, {"input1": {"src": "hda", "id": "d1"}})
    assert g.posted is not None
    assert "not 'cat1'" in out["inputs_not_pre_checked"]


def test_a_schema_without_a_parameter_list_still_submits():
    g = Galaxy(schema={"id": "cat1"})
    out = run(g, {"input1": {"src": "hda", "id": "d1"}})
    assert g.posted is not None
    assert "without a parameter list" in out["inputs_not_pre_checked"]


def test_scalar_only_inputs_read_no_schema():
    """The schema read builds the whole tool form server-side; nothing to check, nothing to read."""
    g = Galaxy()
    run(g, {"lines": 5, "cond": "c1>3"})
    assert g.schema_reads() == []
    assert g.posted is not None


def test_a_reference_input_reads_the_schema_once():
    g = Galaxy()
    run(g, {"input1": {"src": "hda", "id": "d1"}})
    assert len(g.schema_reads()) == 1


def test_a_user_tool_is_checked_against_its_representation():
    g = Galaxy()
    out = run_udt(g, {"input1": {"src": "hdca", "id": "c1"}})
    assert g.posted is None
    assert out.is_error
    assert g.schema_reads() == [], "a held representation needs no toolbox lookup"


def test_a_user_tool_with_accepted_inputs_is_submitted():
    g = Galaxy()
    out = run_udt(g, {"input1": {"src": "hda", "id": "d1"}})
    assert g.posted[1]["tool_uuid"] == "u-1"
    assert "inputs_not_pre_checked" not in out


def test_a_user_tool_whose_representation_is_missing_still_submits():
    g = Galaxy(udt={"tool_id": "my_filter"})
    out = run_udt(g, {"input1": {"src": "hdca", "id": "c1"}})
    assert g.posted is not None
    assert "inputs_not_pre_checked" in out
