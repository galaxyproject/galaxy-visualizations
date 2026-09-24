"""The three user-tool calls must address the unprivileged routes, with a wrapped body."""

import asyncio
from olit.drivers.loop.galaxy_tools import _create_user_tool, _delete_user_tool, _list_user_tools


class Galaxy:
    def __init__(self):
        self.calls = []

    async def get(self, path, **k):
        self.calls.append(("GET", path, None))
        return []

    async def post(self, path, body):
        self.calls.append(("POST", path, body))
        return {"uuid": "u1"}

    async def delete(self, path):
        self.calls.append(("DELETE", path, None))


def test_create_wraps_the_representation_for_the_user_route():
    g = Galaxy()
    rep = {"class": "GalaxyUserTool", "id": "t"}
    asyncio.run(_create_user_tool(g, {"representation": rep}))
    assert g.calls == [("POST", "api/unprivileged_tools", {"representation": rep})]


def test_list_and_delete_use_the_user_route():
    g = Galaxy()
    asyncio.run(_list_user_tools(g, {}))
    asyncio.run(_delete_user_tool(g, {"uuid": "abc"}))
    assert g.calls[0][1].startswith("api/unprivileged_tools")
    assert g.calls[1][:2] == ("DELETE", "api/unprivileged_tools/abc")
