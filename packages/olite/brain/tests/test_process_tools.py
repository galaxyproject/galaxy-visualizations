"""Every process is advertised as a tool, and its schema comes from its yml inputs."""

import asyncio
import json

from olite.drivers.loop.tools import ToolSurface, _process_tool_schemas
from olite.registry import ProcessRegistry


class FakeManifest:
    def __init__(self, granted=None):
        self.granted = granted

    def allows(self, capability):
        return True if self.granted is None else capability in self.granted


class FakeSubstrate:
    def __init__(self, granted=None):
        self.manifest = FakeManifest(granted)

    def scoped(self, capabilities):
        return self


def _schemas():
    return {s["function"]["name"]: s["function"] for s in _process_tool_schemas(_processes())}


def _processes():
    return ProcessRegistry().load_packaged()


def _surface(granted=None):
    return ToolSurface(FakeSubstrate(granted), _processes())


def _advertised(granted):
    names = [t["function"]["name"] for t in _surface(granted).schemas()]
    return sorted(n for n in names if n in _processes().names())


def test_every_registered_process_is_advertised_exactly_once():
    names = [t["function"]["name"] for t in _surface().schemas()]
    for process in _processes().names():
        assert names.count(process) == 1, f"{process} advertised {names.count(process)} times"


def test_the_generic_runner_is_gone():
    assert "run_process" not in [t["function"]["name"] for t in _surface().schemas()]


def test_vintent_requires_both_of_its_inputs():
    fn = _schemas()["vintent_dataset"]
    assert sorted(fn["parameters"]["required"]) == ["dataset_id", "request"]
    assert set(fn["parameters"]["properties"]) == {"dataset_id", "request"}


def test_lineage_keeps_its_optional_numbers_optional():
    fn = _schemas()["lineage_report"]
    params = fn["parameters"]
    # The graph endpoint is history-scoped, so the history is required alongside the seed.
    assert sorted(params["required"]) == ["dataset_id", "history_id"]
    assert params["properties"]["depth"]["type"] == "integer"
    assert params["properties"]["limit"]["type"] == "integer"


def test_an_array_input_becomes_an_array_of_strings():
    params = _schemas()["organize_datasets"]["parameters"]
    assert params["properties"]["tags"] == {"type": "array", "items": {"type": "string"}}


def test_a_default_is_shown_to_the_model():
    props = _schemas()["organize_datasets"]["parameters"]["properties"]
    assert "auto" in props["structure"]["description"]


def test_the_description_carries_when_to_use():
    for name, fn in _schemas().items():
        process = _processes().get(name)
        assert process.description in fn["description"]
        if process.when_to_use:
            assert process.when_to_use in fn["description"]


def test_a_missing_required_input_is_refused_before_the_graph_runs():
    outcome = asyncio.run(_surface().dispatch("vintent_dataset", {"dataset_id": "d1"}))
    assert outcome.is_error and "request" in outcome.text


def test_an_unknown_name_is_still_unknown():
    outcome = asyncio.run(_surface().dispatch("organise_datasets", {}))
    assert outcome.is_error and "Unknown tool" in outcome.text


def test_a_session_without_read_sees_no_processes():
    assert _advertised({"llm", "local"}) == []


def test_a_read_only_session_does_not_see_the_writer():
    advertised = _advertised({"llm", "local", "read"})
    assert "organize_datasets" not in advertised
    assert "vintent_dataset" in advertised and "lineage_report" in advertised


def test_a_write_session_sees_every_process():
    assert _advertised({"llm", "local", "read", "write"}) == sorted(_processes().names())


def test_a_process_is_never_advertised_where_it_could_not_run():
    """Scoped() intersects, so advertising past the grant offers a tool that must fail."""
    for granted in ({"llm", "local"}, {"llm", "local", "read"}, {"llm", "local", "read", "write"}):
        for name in _advertised(granted):
            declared = _processes().get(name).capabilities or []
            assert set(declared) <= granted, f"{name} advertised without {set(declared) - granted}"


def test_per_input_help_reaches_the_model():
    """A parameter the model cannot guess at needs its description carried through."""
    props = _schemas()["organize_datasets"]["parameters"]["properties"]
    assert "sample" in props["sample_regex"]["description"]
    assert "mate" in props["sample_regex"]["description"]


def test_a_process_summarizes_its_own_state():
    """organize_datasets owns its summary; the tool surface only asks for one."""
    from olite.registry.python.organize_datasets import organize_datasets, summarize_state

    assert organize_datasets.summarize is summarize_state
    assert _processes().get("organize_datasets").summarize is summarize_state


def test_a_process_without_a_summary_returns_its_result():
    registry = ProcessRegistry()

    async def plain(substrate, value: str = "x"):
        """A process with no summary of its own."""
        return {"grouping": {"structure": "list"}, "value": value}

    registry.register_python(plain)
    surface = ToolSurface(FakeSubstrate(), registry)
    out = json.loads(asyncio.run(surface.dispatch("plain", {"value": "kept"})).text)
    assert out == {"grouping": {"structure": "list"}, "value": "kept"}


def test_a_process_the_manifest_hides_is_refused_rather_than_run():
    """`names()` is unfiltered and `_dispatch` routes on it, so hiding one has to refuse it."""
    surface = _surface({"llm", "local", "read"})
    assert "organize_datasets" not in _advertised({"llm", "local", "read"})

    outcome = asyncio.run(surface.dispatch("organize_datasets", {}))
    assert outcome.refused and "'write' capability" in outcome.text


def test_an_olite_tool_is_named_as_one_at_every_galaxy_tool_lookup():
    """`run_tool` said so; the read-only lookups handed back Galaxy's bare 404.

    An agent searched the catalog nine times for `vintent_dataset`, called
    get_tool_details twice, and settled for a different route.
    """
    surface = _surface()
    for name in ("run_tool", "get_tool_details", "get_tool_input_template",
                 "get_tool_run_examples", "get_tool_citations"):
        outcome = asyncio.run(surface.dispatch(name, {"tool_id": "vintent_dataset",
                                                      "history_id": "h1", "inputs": {}}))
        assert "is an OLite tool" in outcome.text, name
        assert "Call vintent_dataset directly" in outcome.text, name


def test_a_python_process_can_refuse_and_the_loop_hears_it():
    """`last.ok` is hard-coded True for a function, so only its summary can refuse."""
    import asyncio as _asyncio

    class Refusing:
        capabilities = ["read"]
        inputs = {}
        description = "refuses"
        when_to_use = ""
        graph = None

        async def run(self, substrate, inputs):
            return {"state": {"bad": True}, "last": {"ok": True, "result": {"bad": True}}}

        def summarize(self, state):
            return {"ok": False, "error": "Refused: nope."}

    class Registry:
        def names(self):
            return ["refuser"]

        def get(self, name):
            return Refusing() if name == "refuser" else None

    surface = ToolSurface(FakeSubstrate({"llm", "local", "read"}), Registry())
    outcome = _asyncio.run(surface.dispatch("refuser", {}))
    assert outcome.is_error and outcome.refused
    assert "Refused: nope." in outcome.text
