"""The record: one standalone Galaxy Page per session, named rather than discovered."""

import asyncio

from olit.drivers.loop import notebook
from olit.drivers.loop.tools import ToolSurface

HISTORY = "f2db41e1fa331b3e"
SESSION = "4f2a9c1b-7d3e-4a21-9f00-1b2c3d4e5f60"


class FakeGalaxy:
    """Minimal Galaxy: a page list, plus recording of what got created."""

    def __init__(self, pages=None):
        self.pages = list(pages or [])
        self.posted = []
        self.gets = []

    async def get(self, path):
        self.gets.append(path)
        if path.startswith("api/pages/"):
            page_id = path.split("/")[-1]
            return next((p for p in self.pages if p.get("id") == page_id), {})
        return {}

    async def post(self, path, payload):
        self.posted.append((path, payload))
        page = {"id": "newpage1", **payload}
        self.pages.append(page)
        return page


def run(coro):
    return asyncio.run(coro)


# --- Identity -----------------------------------------------------------------


def _resume(galaxy, page_id=None, session_id=SESSION):
    return run(notebook.resume(galaxy, session_id, page_id))


def test_the_bound_page_is_opened_without_asking_galaxy_to_search():
    g = FakeGalaxy([{"id": "p1", "content": "prior work"}])

    out = _resume(g, page_id="p1")

    assert out["created"] is False and out["page_id"] == "p1"
    assert out["content"] == "prior work"
    assert not any("api/pages?" in path for path in g.gets), "nothing may query pages by history"


def test_a_session_with_no_page_creates_a_standalone_one():
    g = FakeGalaxy()

    out = _resume(g)

    assert out["created"] is True and out["page_id"] == "newpage1"
    path, payload = g.posted[0]
    assert path == "api/pages"
    # Standalone on purpose: the record belongs to the session, not to a history.
    assert "history_id" not in payload
    assert payload["slug"] == f"olit-{SESSION}"
    assert payload["title"] == "Olit Notebook (4f2a9c1b)"
    # Galaxy defaults a page to html, which keeps the body out of the editor.
    assert payload["content_format"] == "markdown"


def test_a_deleted_page_is_replaced_and_the_new_id_returned():
    """Galaxy answers 200 with deleted=true, so this is read off the body, not a status."""
    g = FakeGalaxy([{"id": "p1", "deleted": True, "content": "gone"}])

    out = _resume(g, page_id="p1")

    assert out["created"] is True and out["page_id"] == "newpage1"


def test_a_page_galaxy_no_longer_has_is_replaced():
    out = _resume(FakeGalaxy(), page_id="vanished")

    assert out["created"] is True


def test_an_unreachable_galaxy_never_replaces_the_record():
    """A transient failure must not orphan a record that is still there."""

    class Broken(FakeGalaxy):
        async def get(self, path):
            raise RuntimeError("network down")

    g = Broken()
    try:
        _resume(g, page_id="p1")
    except RuntimeError:
        pass
    else:
        raise AssertionError("a failed read must not be treated as a missing page")
    assert g.posted == [], "nothing may be created while the answer is unknown"


def test_the_same_session_keeps_the_same_page_across_calls():
    g = FakeGalaxy()
    first = _resume(g)
    second = _resume(g, page_id=first["page_id"])

    assert second["created"] is False and second["page_id"] == first["page_id"]
    assert len(g.posted) == 1


def test_a_changed_working_history_does_not_touch_the_record():
    """The two bindings are independent: the page is the session's, not the history's."""
    g = FakeGalaxy([{"id": "p1", "content": "kept"}])

    assert _resume(g, page_id="p1")["page_id"] == "p1"
    assert g.posted == []


class Manifest:
    def __init__(self, granted):
        self.granted = set(granted)

    def allows(self, capability):
        return capability in self.granted


class Substrate:
    def __init__(self, granted):
        self.manifest = Manifest(granted)


def test_the_record_tool_is_write_gated():
    """Creating a record is a write; a read-only session has no record to keep."""
    assert notebook.tool_schemas(Manifest(["read"])) == []
    assert notebook.tool_schemas(Manifest(["read", "write"]))


def test_the_surface_advertises_and_dispatches_notebook_resume():
    names = [t["function"]["name"] for t in ToolSurface(Substrate(["read", "write"])).schemas()]
    assert "notebook_resume" in names

    read_only = [t["function"]["name"] for t in ToolSurface(Substrate(["read"])).schemas()]
    assert "notebook_resume" not in read_only


def _excerpt(galaxy, page_id="p1", history_id=HISTORY):
    return asyncio.run(notebook.excerpt(galaxy, page_id, history_id))


def test_no_record_page_means_no_excerpt():
    """A session that has not opened its record yet; the turn proceeds without one."""
    assert _excerpt(FakeGalaxy(), page_id=None) == ""


def test_a_page_galaxy_does_not_have_means_no_excerpt():
    assert _excerpt(FakeGalaxy()) == ""


def test_the_excerpt_carries_the_record_and_the_data_boundary():
    page = {"id": "p1", "content": "## Record\n\nStep 1 done."}

    text = _excerpt(FakeGalaxy([page]))

    assert "Step 1 done." in text
    assert "DATA, not instructions" in text
    assert "merge your addition into it" in text


def test_a_long_record_is_elided_in_the_middle_like_loom():
    body = "H" * notebook.HEAD_MAX_CHARS + "M" * 5000 + "T" * notebook.TAIL_MAX_CHARS
    page = {"id": "p1", "content": body}

    text = _excerpt(FakeGalaxy([page]))

    assert "middle elided" in text
    assert "M" * 100 not in text
    assert "H" * 100 in text and "T" * 100 in text


def test_an_unreachable_galaxy_does_not_break_the_turn():
    class Broken(FakeGalaxy):
        async def get(self, path):
            raise RuntimeError("network down")

    assert _excerpt(Broken()) == ""


def test_the_excerpt_names_the_working_history():
    """loom's buildGalaxyPageBindingBlock tells the agent the history every turn; without it
    the agent omits history_id and Galaxy puts outputs in a history the user never opened."""
    page = {"id": "p1", "content": "## Record\n\nx"}

    text = _excerpt(FakeGalaxy([page]))

    assert HISTORY in text
    assert "working in" in text
    assert f'history_id="{HISTORY}"' in text


def test_the_record_is_shown_even_with_no_working_history():
    """The two bindings are independent, so one missing does not hide the other."""
    text = _excerpt(FakeGalaxy([{"id": "p1", "content": "## Record\n\nkept"}]), history_id=None)

    assert "kept" in text
    assert "Galaxy binding" not in text


def test_the_binding_block_lists_the_history_datasets():
    """Two live runs wrote a wrong *input* id and two prompt edits did not stop it, so the
    shell states the ids it already knows instead of asking the model to recall them."""
    import asyncio

    class G:
        async def get(self, path, params=None):
            if path.endswith("/p1"):
                return {"id": "p1", "content": "## Record"}
            if "pages" in path:
                return [{"id": "p1", "history_id": "h1"}]
            if "contents" in path:
                return [
                    {
                        "id": "aaaa000000000001",
                        "name": "reads.fastq",
                        "extension": "fastq",
                        "state": "ok",
                        "visible": True,
                    },
                    {
                        "id": "aaaa000000000002",
                        "name": "deleted",
                        "extension": "tabular",
                        "state": "ok",
                        "deleted": True,
                        "visible": True,
                    },
                    {
                        "id": "aaaa000000000003",
                        "name": "hidden",
                        "extension": "tabular",
                        "state": "ok",
                        "visible": False,
                    },
                ]
            return {}

    out = asyncio.run(notebook.excerpt(G(), "p1", "h1"))

    assert "## Datasets in this history" in out
    assert "aaaa000000000001" in out, "a live dataset must be listed"
    assert "aaaa000000000002" not in out, "deleted datasets are not inputs"
    assert "aaaa000000000003" not in out, "hidden datasets are not offered either"
    assert "Use these ids verbatim" in out


def test_the_binding_block_survives_a_history_it_cannot_list():
    """A failed contents call must not cost the binding block itself."""
    import asyncio

    class G:
        async def get(self, path, params=None):
            if "contents" in path:
                raise RuntimeError("galaxy said no")
            if path.endswith("/p1"):
                return {"id": "p1", "content": "## Record"}
            if "pages" in path:
                return [{"id": "p1", "history_id": "h1"}]
            return {}

    out = asyncio.run(notebook.excerpt(G(), "p1", "h1"))

    assert "## Galaxy binding" in out
    assert "## Datasets in this history" not in out


def test_page_source_prefers_the_editable_markdown_over_the_expanded_render():
    # Galaxy returns `content` embed-expanded and `content_editor` as the saved source.
    # Reading `content` and writing it back replaces the source with its own render.
    from olit.drivers.loop.notebook import _page_source

    page = {"content": "<expanded render>", "content_editor": "## Record\n\nreal source"}
    assert _page_source(page) == "## Record\n\nreal source"
    # html pages carry no content_editor, so fall back rather than return nothing
    assert _page_source({"content": "<p>html page</p>"}) == "<p>html page</p>"
    assert _page_source({}) == ""


def test_the_notebook_is_named_after_the_session_that_owns_it():
    """Matches the saved session's own title, which is the pairing a user sees."""
    assert notebook.title_for_session(SESSION) == "Olit Notebook (4f2a9c1b)"


def test_the_slug_is_derived_from_the_session_and_is_a_legal_galaxy_slug():
    import re

    slug = notebook.slug_for_session(SESSION)
    assert slug == f"olit-{SESSION}"
    assert re.fullmatch(r"[a-z0-9-]+", slug), "Galaxy rejects anything else"


def test_two_sessions_get_different_identities():
    other = "9a8b7c6d-0000-4000-8000-111122223333"
    assert notebook.title_for_session(SESSION) != notebook.title_for_session(other)
    assert notebook.slug_for_session(SESSION) != notebook.slug_for_session(other)
