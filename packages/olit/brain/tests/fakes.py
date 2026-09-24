"""Stand-ins for the substrate, shared by the loop tests."""

from olit.substrate import CapabilityManifest
from olit.substrate.llm import Reply


class ScriptedLlm:
    """Replays prepared replies, one per completion, and keeps what it was asked."""

    def __init__(self, *choices, on_call=None):
        self.choices = list(choices)
        self.calls = []
        self.on_call = on_call

    async def complete(self, messages, tools=None, **kwargs):
        self.calls.append(messages)
        if self.on_call:
            self.on_call()
        if not self.choices:
            raise AssertionError("the loop asked for more completions than the test scripted")
        return self.choices.pop(0)


class Local:
    def __init__(self, output="ran"):
        self.output = output
        self.ran = []

    async def run(self, code):
        self.ran.append(code)
        return self.output


class FakeSubstrate:
    def __init__(self, llm=None, *, galaxy=None, local=None, config=None,
                 capabilities=("llm", "local", "read")):
        self.llm = llm
        self.galaxy = galaxy
        self.local = Local() if local is None else local
        self.config = config
        self.manifest = CapabilityManifest(list(capabilities))

    def scoped(self, capabilities):
        return self


def call(name, arguments, call_id="c1"):
    return {"id": call_id, "function": {"name": name, "arguments": arguments}}


def choice(tool_calls, finish_reason="tool_calls", content=""):
    return Reply(content=content, tool_calls=tool_calls, finish_reason=finish_reason)


def tool_messages(result):
    return [m for m in result["messages"] if m.get("role") == "tool"]


def refused(outcome):
    """The payload of a call the tool refused, asserting it was recorded as a failure."""
    assert getattr(outcome, "is_error", False), f"not recorded as a failure: {outcome!r}"
    return outcome.content
