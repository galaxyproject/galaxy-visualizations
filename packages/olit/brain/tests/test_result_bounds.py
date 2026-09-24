"""Nothing a Galaxy read returns may end the turn by itself.

Compaction summarises older messages, so it cannot shrink the result that just arrived:
one oversized result leaves the loop "over the context budget with nothing left to
compact". Two layers guard that -- tools page their own rows, and the dispatcher
discards whatever still arrives too large.
"""

import asyncio
import json

from olit.drivers.loop.agent import MAX_TOOL_RESULT_BYTES, LoopDriver
from olit.drivers.loop.galaxy_tools import _get_histories, _get_history_contents, _get_tool_panel
from olit.drivers.loop.paging import ROW_BYTES_CAP, ROW_CAP, page
from olit.substrate.llm import Reply
from .fakes import FakeSubstrate, Local, ScriptedLlm


class FakeGalaxy:
    def __init__(self, payload):
        self.payload = payload
        self.paths = []

    async def get(self, path, binary=False):
        self.paths.append(path)
        return self.payload


def test_a_page_carries_the_offset_to_continue_from():
    got = page([{"i": i} for i in range(250)])
    assert got["shown"] == ROW_CAP and got["total"] == 250
    assert got["truncated"] is True and got["next_offset"] == ROW_CAP


def test_fat_rows_are_bounded_by_bytes_not_by_count():
    got = page([{"pad": "x" * 5000} for _ in range(ROW_CAP)])
    assert got["shown"] < ROW_CAP
    assert len(json.dumps(got["items"])) <= ROW_BYTES_CAP + 5000


def test_one_oversized_row_still_comes_back():
    assert page([{"pad": "x" * (ROW_BYTES_CAP * 2)}])["shown"] == 1


def test_a_complete_page_is_not_marked_truncated():
    got = page([{"i": i} for i in range(3)])
    assert "truncated" not in got and "next_offset" not in got


def test_get_histories_asks_galaxy_for_a_bounded_page():
    g = FakeGalaxy([])
    asyncio.run(_get_histories(g, {}))
    # One past the cap: the extra row is how a bounded page reports that more exist.
    assert f"limit={ROW_CAP + 1}" in g.paths[0]


def test_a_bounded_page_of_histories_says_that_more_exist():
    g = FakeGalaxy([{"id": f"h{i}"} for i in range(ROW_CAP + 1)])
    got = asyncio.run(_get_histories(g, {}))
    assert got["shown"] == ROW_CAP
    assert got["truncated"] is True and got["next_offset"] == ROW_CAP


def test_a_bounded_page_of_history_contents_says_that_more_exist():
    g = FakeGalaxy([{"id": f"d{i}", "hid": i} for i in range(101)])
    got = asyncio.run(_get_history_contents(g, {"history_id": "h1"}))
    assert "limit=101" in g.paths[0]
    assert got["shown"] == 100 and got["truncated"] is True and got["next_offset"] == 100


def test_the_last_page_of_histories_is_not_marked_truncated():
    g = FakeGalaxy([{"id": "h1"}, {"id": "h2"}])
    got = asyncio.run(_get_histories(g, {}))
    assert got["shown"] == 2 and "truncated" not in got


def test_the_tool_panel_can_be_narrowed_to_one_section():
    panel = [
        {"model_class": "ToolSection", "name": "Get Data",
         "elems": [{"model_class": "Tool", "id": "upload1", "name": "Upload"}]},
        {"model_class": "ToolSection", "name": "Text Manipulation",
         "elems": [{"model_class": "Tool", "id": "cat1", "name": "Concatenate"}]},
    ]
    got = asyncio.run(_get_tool_panel(FakeGalaxy(panel), {"section": "text manipulation"}))
    assert [s["section"] for s in got["items"]] == ["Text Manipulation"]


def _run(output):
    llm = ScriptedLlm(
        Reply(content="", tool_calls=[{"id": "c1", "function": {
            "name": "run_python", "arguments": '{"code": "print(1)"}'}}],
            finish_reason="tool_calls"),
        Reply(content="done", tool_calls=[], finish_reason="stop"),
    )
    result = asyncio.run(LoopDriver(FakeSubstrate(llm, local=Local(output))).run(
        [{"role": "user", "content": "go"}]))
    return [m for m in result["messages"] if m.get("role") == "tool"][0]


def test_an_oversized_result_is_discarded_and_says_how_to_recover():
    message = _run("x" * (MAX_TOOL_RESULT_BYTES + 1))
    assert "x" * 100 not in message["content"]
    assert "run_python" in message["content"]
    # The recovery names no parameter: `get_tool_details` has no limit, offset or filter, and
    # the old wording sent the model looking for them.
    assert "narrow" in message["content"]
    assert "offset" not in message["content"] and "limit and page" not in message["content"]


def test_a_result_inside_the_budget_is_passed_through_untouched():
    assert "y" * 1000 in _run("y" * 1000)["content"]
