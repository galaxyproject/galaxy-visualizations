"""The openapi catalog is a cost of the graph route, not of booting.

It is ~2 MB and only the graph route and the galaxy process helper call through it. Every
Galaxy tool reaches Galaxy through the client or galaxy-ops, so a session that never takes
that route should never fetch it, and one whose fetch fails should still run every tool.
"""

import asyncio

import pytest

from olit.substrate import catalog as catalog_module
from olit.substrate.catalog import Catalog


class _Manifest:
    def allows(self, capability):
        return True


@pytest.fixture
def build(monkeypatch):
    """A catalog whose loader is ours, restored when the test ends."""

    def make(loader):
        monkeypatch.setattr(catalog_module, "load_providers", loader)
        return Catalog({"galaxy_root": "http://galaxy.invalid/"}, _Manifest())

    return make


def test_nothing_is_fetched_until_something_calls_through(build):
    calls = []

    async def loader(config):
        calls.append(config)
        return []

    catalog = build(loader)
    assert catalog.status() == {"loaded": False, "op_count": 0, "error": None, "asked": False}
    assert calls == [], "asking for status must not load the catalog"


def test_the_first_call_loads_it_once(build):
    calls = []

    async def loader(config):
        calls.append(config)
        return []

    catalog = build(loader)
    asyncio.run(catalog.call("galaxy.version.get"))
    asyncio.run(catalog.call("galaxy.version.get"))
    assert len(calls) == 1, "loaded once, not once per call"
    assert catalog.status()["asked"] is True


def test_a_failed_load_is_reported_and_not_retried(build):
    attempts = []

    async def loader(config):
        attempts.append(1)
        raise RuntimeError("no openapi here")

    catalog = build(loader)
    answer = asyncio.run(catalog.call("galaxy.version.get"))
    assert answer["ok"] is False
    assert answer["error"]["code"] == "catalog_unavailable"
    assert "no openapi here" in answer["error"]["message"]
    asyncio.run(catalog.call("galaxy.version.get"))
    assert len(attempts) == 1, "a dead catalog must not be re-fetched on every call"


def test_a_scoped_view_sees_a_load_the_parent_made(build):
    async def loader(config):
        return []

    catalog = build(loader)
    view = catalog.scoped(_Manifest())
    asyncio.run(catalog.call("galaxy.version.get"))
    assert view.status()["asked"] is True
