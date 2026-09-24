"""A tool may consume datasets from the history it runs in, and no other."""

import asyncio

from olit.drivers.loop.galaxy_tools import _hda_inputs, _run_tool

HERE = "aaaaaaaaaaaaaaaa"
ELSEWHERE = "bbbbbbbbbbbbbbbb"


class Galaxy:
    """Datasets mapped to the history that owns them; records any submission."""

    def __init__(self, owners):
        self.owners = owners
        self.posted = None

    async def get(self, path, **kwargs):
        dataset_id = path.rsplit("/", 1)[-1]
        return {"id": dataset_id, "name": f"ds-{dataset_id}",
                "history_id": self.owners.get(dataset_id)}

    async def post(self, path, body):
        self.posted = body
        return {"jobs": [{"id": "j1", "state": "new"}]}


def run(g, history_id, inputs):
    return asyncio.run(_run_tool(g, {"history_id": history_id, "tool_id": "cat1",
                                     "inputs": inputs}))


def test_a_dataset_in_the_target_history_is_allowed():
    g = Galaxy({"d1": HERE})
    out = run(g, HERE, {"input": {"src": "hda", "id": "d1"}})
    assert g.posted is not None
    assert out["jobs"][0]["state"] == "new"


def test_a_dataset_from_another_history_is_refused_before_submission():
    g = Galaxy({"d1": ELSEWHERE})
    out = run(g, HERE, {"input": {"src": "hda", "id": "d1"}})
    assert g.posted is None, "nothing may reach Galaxy"
    assert out["submitted"] is False
    assert out["rejected_inputs"][0]["supplied_id"] == "d1"
    assert out["rejected_inputs"][0]["resolves_to_history_id"] == ELSEWHERE
    assert out["target_history_id"] == HERE


def test_working_in_a_newly_created_history_is_allowed():
    """Targeting a different history than Olit is bound to is legal; ownership is what counts."""
    fresh = "cccccccccccccccc"
    g = Galaxy({"d1": fresh})
    run(g, fresh, {"input": {"src": "hda", "id": "d1"}})
    assert g.posted is not None


def test_one_bad_input_among_several_refuses_the_whole_submission():
    g = Galaxy({"d1": HERE, "d2": ELSEWHERE, "d3": HERE})
    out = run(g, HERE, {"a": {"src": "hda", "id": "d1"},
                        "b": {"src": "hda", "id": "d2"},
                        "c": {"src": "hda", "id": "d3"}})
    assert g.posted is None
    assert [f["supplied_id"] for f in out["rejected_inputs"]] == ["d2"]


def test_nested_and_repeated_inputs_are_inspected():
    g = Galaxy({"d1": HERE, "d2": ELSEWHERE})
    out = run(g, HERE, {"queries": [{"input2": {"src": "hda", "id": "d1"}},
                                    {"input2": {"src": "hda", "id": "d2"}}]})
    assert g.posted is None
    assert [f["supplied_id"] for f in out["rejected_inputs"]] == ["d2"]


def test_non_dataset_parameters_are_left_alone():
    g = Galaxy({"d1": HERE})
    run(g, HERE, {"input": {"src": "hda", "id": "d1"}, "cond": "c3=='Gold'", "lines": 5})
    assert g.posted["inputs"]["cond"] == "c3=='Gold'"


def test_the_finder_reaches_nested_structures():
    found = _hda_inputs({"a": {"src": "hda", "id": "x"},
                         "r": [{"b": {"src": "hda", "id": "y"}}],
                         "plain": 3})
    assert sorted(i for _, i in found) == ["x", "y"]


def test_history_contents_offers_one_identifier():
    """Galaxy returns the HDA id and the underlying Dataset id; both encode alike, so the
    wrong one resolves to an unrelated object rather than failing."""
    import asyncio

    from olit.drivers.loop.galaxy_tools import _get_history_contents

    class G:
        async def get(self, path, **kwargs):
            return [{"id": "hda1", "dataset_id": "underlying1", "name": "x.tabular", "hid": 1}]

    items = asyncio.run(_get_history_contents(G(), {"history_id": HERE}))["items"]
    assert items[0]["id"] == "hda1"
    assert "dataset_id" not in items[0]
    assert items[0]["hid"] == 1 and items[0]["name"] == "x.tabular"
