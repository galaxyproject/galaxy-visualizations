"""Tool names spelled with Cyrillic/Greek lookalikes still reach their tool."""

import asyncio
import json

import pytest

from olite.drivers.loop import confusables
from olite.drivers.loop.tools import ToolSurface
from olite.registry import ProcessRegistry

# `run_python` with a Cyrillic е (U+0435) and о (U+043E).
SNEAKY = "run_pythоn"
CYRILLIC_C = "с"


class FakeManifest:
    def __init__(self, granted=()):
        self.granted = set(granted)

    def allows(self, capability):
        return capability in self.granted


class FakeLocal:
    def __init__(self):
        self.ran = []

    def run(self, code):
        self.ran.append(code)
        return "42"


class FakeSubstrate:
    def __init__(self, granted=()):
        self.manifest = FakeManifest(granted)
        self.local = FakeLocal()

    def scoped(self, capabilities):
        # Narrowing is covered by tests/test_least_privilege.py.
        return self


# --- The fold ------------------------------------------------------------------


def test_the_table_maps_the_observed_lookalikes():
    assert confusables.fold(SNEAKY) == "run_python"
    assert confusables.fold(f"sear{CYRILLIC_C}h_tools_by_name") == "search_tools_by_name"
    # Greek, which the table also covers.
    assert confusables.fold("inτoke") == "intoke"


def test_pure_ascii_is_left_alone():
    assert confusables.fold("run_python") == "run_python"
    assert confusables.has_confusables("run_python") is False
    assert confusables.has_confusables(SNEAKY) is True


def test_a_hallucinated_name_is_not_resolved():
    """Pure ASCII that matches nothing is a made-up tool, not a spelling problem."""
    assert confusables.find_match("run_pythonn", ["run_python"]) is None
    assert confusables.find_match("totally_made_up", ["run_python"]) is None


def test_a_lookalike_resolves_to_its_candidate():
    assert confusables.find_match(SNEAKY, ["finish", "run_python"]) == "run_python"


def test_no_candidate_means_no_match():
    assert confusables.find_match(SNEAKY, ["finish"]) is None


@pytest.mark.parametrize("value", ["", None])
def test_empty_input_is_harmless(value):
    assert confusables.has_confusables(value) is False
    assert confusables.find_match(value, ["run_python"]) is None


# --- Through the tool surface ---------------------------------------------------


def test_a_lookalike_call_reaches_the_real_tool():
    substrate = FakeSubstrate(("local",))
    surface = ToolSurface(substrate)

    result = asyncio.run(surface.dispatch(SNEAKY, {"code": "6*7"})).text

    assert result == "42"
    assert substrate.local.ran == ["6*7"], "the real tool did not run"


def test_an_unknown_name_still_reports_unknown():
    surface = ToolSurface(FakeSubstrate(("local",)))
    assert "Unknown tool" in asyncio.run(surface.dispatch("no_such_tool", {})).text


def test_folding_cannot_reach_a_tool_the_session_was_not_offered():
    """An ungranted write tool is not advertised, so it must stay unreachable."""
    surface = ToolSurface(FakeSubstrate(("read",)))  # no write grant
    advertised = [t["function"]["name"] for t in surface.schemas()]
    assert "run_tool" not in advertised, "fixture assumption: run_tool is write-gated"

    out = asyncio.run(surface.dispatch("run_tоol", {})).text
    assert "Unknown tool" in out


def test_a_lookalike_process_name_still_reaches_its_process():
    """The fold applies to every advertised tool, processes included."""
    processes = ProcessRegistry()
    processes.register("p", {"version": 1, "id": "p", "kind": "agent_pipeline", "start": "d",
                             "nodes": {"d": {"type": "terminal", "output": {"ok": 1}}}})
    surface = ToolSurface(FakeSubstrate(("local",)), processes)

    out = json.loads(asyncio.run(surface.dispatch("р", {})).text)  # Cyrillic er
    assert out == {"ok": 1}
