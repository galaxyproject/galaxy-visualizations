"""One session per worker; one tool surface per turn."""

import asyncio

from olit import config as config_module
from olit import runtime
from olit.drivers.loop.agent import LoopDriver
from olit.registry import ProcessRegistry
from olit.substrate import Confirmation
from olit.substrate.llm import Reply

from .fakes import FakeSubstrate, ScriptedLlm, call


class Asked(Confirmation):
    def __init__(self, answer):
        super().__init__(ask=self._ask)
        self.answer = answer
        self.asked = []

    async def _ask(self, payload):
        self.asked.append(payload)
        return self.answer


def _turn(*calls, content=""):
    return Reply(content=content, tool_calls=list(calls), finish_reason="tool_calls" if calls else "stop")


async def draw(substrate):
    """A process that hands the shell an artifact."""
    return {"artifact": {"kind": "mermaid", "diagram": "graph TD; a-->b"}}


def _processes():
    registry = ProcessRegistry()
    registry.register_python(draw)
    return registry


def test_the_session_is_built_once_and_rebuilt_only_for_a_different_config(monkeypatch):
    monkeypatch.setattr(runtime, "_session", None)
    first = asyncio.run(runtime._session_for(config_module.parse({})))
    again = asyncio.run(runtime._session_for(config_module.parse({})))
    other = asyncio.run(runtime._session_for(config_module.parse({"dataset_id": "d1"})))
    assert again is first
    assert other is not first


def test_a_turns_artifacts_do_not_leak_into_the_next():
    llm = ScriptedLlm(
        _turn(call("draw", "{}")),
        _turn(content="Drawn."),
        _turn(content="Nothing more."),
    )
    driver = LoopDriver(FakeSubstrate(llm, capabilities=("llm", "local", "read", "write")), _processes())
    messages = [{"role": "user", "content": "draw it"}]

    first = asyncio.run(driver.run(messages))
    assert [a["kind"] for a in first["artifacts"]] == ["mermaid"]

    second = asyncio.run(driver.run([*first["messages"], {"role": "user", "content": "and now?"}]))
    assert second["artifacts"] == []


def test_the_approval_bridge_is_the_turns_own():
    destructive = call("update_history", '{"history_id": "h1", "deleted": true}')
    llm = ScriptedLlm(_turn(destructive), _turn(content="ok"), _turn(destructive), _turn(content="ok"))
    driver = LoopDriver(FakeSubstrate(llm, capabilities=("llm", "local", "read", "write")))
    messages = [{"role": "user", "content": "delete it"}]

    user = Asked(answer=False)
    first = asyncio.run(driver.run(messages, confirmation=user))
    assert len(user.asked) == 1
    assert "declined" in first["messages"][-2]["content"]

    second = asyncio.run(driver.run(messages))
    assert len(user.asked) == 1
    assert "no interactive session" in second["messages"][-2]["content"]
