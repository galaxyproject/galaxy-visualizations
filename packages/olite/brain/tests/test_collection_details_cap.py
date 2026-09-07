"""get_collection_details honours max_elements; an uncapped read overflows the window."""

import asyncio

from olite.drivers.loop.galaxy_tools import _get_collection_details


class FakeGalaxy:
    def __init__(self, n):
        self.n = n

    async def get(self, path, binary=False):
        return {"id": "c1", "element_count": self.n,
                "elements": [{"element_identifier": f"e{i}"} for i in range(self.n)]}


def call(n, **args):
    return asyncio.run(_get_collection_details(FakeGalaxy(n), {"collection_id": "c1", **args}))


def test_a_large_collection_is_truncated_by_default():
    out = call(500)
    assert len(out["elements"]) == 100
    assert out["elements_truncated"] is True and out["element_count"] == 500


def test_max_elements_is_respected():
    assert len(call(500, max_elements=5)["elements"]) == 5


def test_a_small_collection_is_returned_whole():
    out = call(10)
    assert len(out["elements"]) == 10 and "elements_truncated" not in out
