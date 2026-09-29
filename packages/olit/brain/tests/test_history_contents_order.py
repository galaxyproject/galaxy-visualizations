"""The sort order the description offers has to reach Galaxy.

Galaxy honours `order` on history contents only alongside `v=dev`; without it the parameter is
ignored outright, so the ordering the description documents did nothing for either runner.
"""

import asyncio

from olit.loop.galaxy_tools import get_handler


class _Galaxy:
    def __init__(self):
        self.paths = []

    async def get(self, path, binary=False):
        self.paths.append(path)
        return [{"id": "d1", "hid": 1}]


def _contents(args):
    galaxy = _Galaxy()
    asyncio.run(get_handler("get_history_contents")(galaxy, {"history_id": "h1", **args}))
    return galaxy.paths[0]


def test_an_order_reaches_galaxy_with_what_makes_it_count():
    path = _contents({"order": "hid-dsc"})
    assert "order=hid-dsc" in path
    assert "v=dev" in path


def test_the_default_order_is_still_stated():
    assert "order=hid-asc" in _contents({})


def test_a_create_time_order_is_passed_through_unchanged():
    assert "order=create_time-dsc" in _contents({"order": "create_time-dsc"})


def test_the_default_listing_leaves_out_hidden_and_deleted_items():
    """Galaxy filters this endpoint through q/qv; the plain parameters are ignored."""
    path = _contents({})

    assert "q=deleted&q=visible" in path
    assert "qv=False&qv=True" in path


def test_asking_for_hidden_items_stops_filtering_on_visible():
    path = _contents({"visible": False})

    assert "q=visible" not in path
    assert "q=deleted&qv=False" in path


def test_asking_for_deleted_items_stops_filtering_on_deleted():
    path = _contents({"deleted": True})

    assert "q=deleted" not in path
    assert "q=visible&qv=True" in path
