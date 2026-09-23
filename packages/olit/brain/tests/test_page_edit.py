"""Targeted page edits and staleness detection, matching Galaxy's PageEditor."""

import asyncio

from olit.drivers.loop import page_edit
from olit.drivers.loop.galaxy_tools import _update_page

DOC = "## Record\n\nintro\n\n## Methods\n\nold\n\n## Results\n\nfindings\n"


class Page:
    def __init__(self, content=DOC):
        self.content = content
        self.put = None

    async def get(self, path, **kwargs):
        return {"id": "p1", "content_editor": self.content}

    async def put(self, path, body):  # noqa: F811
        self.written = body
        return {"id": "p1", "content_editor": body.get("content", self.content)}


class Galaxy:
    def __init__(self, content=DOC):
        self.content = content
        self.written = None

    async def get(self, path, **kwargs):
        return {"id": "p1", "content_editor": self.content}

    async def put(self, path, body):
        self.written = body
        return {"id": "p1", "content_editor": body.get("content", self.content)}


def run(g, args):
    return asyncio.run(_update_page(g, {"page_id": "p1", **args}))


def test_the_hash_matches_galaxys_implementation():
    assert page_edit.djb2_hash("hello") == "0f923099"


def test_a_section_edit_leaves_other_sections_alone():
    g = Galaxy()
    run(g, {"section_heading": "## Methods", "section_content": "## Methods\n\nnew\n"})
    written = g.written["content"]
    assert "new" in written
    assert "intro" in written and "findings" in written
    assert "old" not in written


def test_an_unknown_heading_is_appended():
    g = Galaxy()
    run(g, {"section_heading": "## Discussion", "section_content": "## Discussion\n\nmore\n"})
    assert "## Discussion" in g.written["content"]
    assert "findings" in g.written["content"]


def test_a_stale_hash_refuses_the_write():
    g = Galaxy()
    out = run(g, {"content": "clobber", "expect_hash": "deadbeef"})
    assert out["written"] is False
    assert g.written is None, "nothing may reach Galaxy on a stale write"
    assert out["content_hash"] == page_edit.djb2_hash(DOC)
    assert out["content"] == DOC


def test_a_current_hash_allows_the_write():
    g = Galaxy()
    run(g, {"content": "fresh", "expect_hash": page_edit.djb2_hash(DOC)})
    assert g.written["content"] == "fresh"


def test_the_write_reports_the_new_hash():
    g = Galaxy()
    out = run(g, {"content": "fresh"})
    assert out["content_hash"] == page_edit.djb2_hash("fresh")


def test_every_write_is_marked_as_an_agent_edit():
    g = Galaxy()
    run(g, {"content": "x"})
    assert g.written["edit_source"] == "agent"
