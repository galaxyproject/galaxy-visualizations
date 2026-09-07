"""How a process's output is split between the artifact pane and the model."""

import asyncio
import json

from olite.drivers.loop.tools import ToolSurface
from olite.registry import ProcessRegistry

from olite.registry import load_primitives

load_primitives()


class FakeManifest:
    def allows(self, capability):
        return False


class FakeSubstrate:
    manifest = FakeManifest()
    galaxy = None
    local = None
    llm = None

    def scoped(self, capabilities):
        # Routing is what these tests are about, not the narrowing itself.
        return self


def _surface(graph):
    processes = ProcessRegistry()
    processes.register("p", graph)
    return ToolSurface(FakeSubstrate(), processes)


def _terminal_graph(output):
    return {"version": 1, "id": "p", "kind": "agent_pipeline", "start": "done",
            "nodes": {"done": {"type": "terminal", "output": output}}}


def _run(surface):
    return json.loads(asyncio.run(surface.dispatch("p", {})).text)


def test_artifact_is_routed_out_of_band_and_reduced_to_a_reference():
    surface = _surface(_terminal_graph({
        "artifact": {"kind": "mermaid", "title": "Dataset lineage", "diagram": "graph TD; A-->B"},
    }))
    payload = _run(surface)

    # The model gets kind + title only.
    assert payload["ok"] is True
    assert payload["artifact"] == {"kind": "mermaid", "title": "Dataset lineage"}
    assert "diagram" not in payload["artifact"]
    # The shell gets the whole thing.
    assert surface.artifacts == [{"kind": "mermaid", "title": "Dataset lineage", "diagram": "graph TD; A-->B"}]


def test_sibling_output_fields_travel_with_the_artifact_reference():
    """The lineage_report shape: a narrative the model needs, plus a diagram it does not."""
    surface = _surface(_terminal_graph({
        "summary": "Produced by bwa_mem then samtools_sort.",
        "truncated": False,
        "artifact": {"kind": "mermaid", "title": "Dataset lineage", "diagram": "graph TD; A-->B"},
    }))
    payload = _run(surface)

    assert payload["summary"] == "Produced by bwa_mem then samtools_sort."
    assert payload["truncated"] is False
    assert payload["artifact"]["kind"] == "mermaid"
    # The diagram source is nowhere in what the model sees.
    assert "graph TD" not in json.dumps(payload)


def test_a_process_without_an_artifact_returns_its_output_unchanged():
    surface = _surface(_terminal_graph({"answer": 42}))
    assert _run(surface) == {"answer": 42}
    assert surface.artifacts == []


def test_lineage_report_declares_its_diagram_as_a_mermaid_artifact():
    """Guards the wiring the shell's mermaid renderer depends on."""
    proc = ProcessRegistry().load_packaged().get("lineage_report")
    output = proc.graph["nodes"]["done"]["output"]

    assert output["artifact"]["kind"] == "mermaid"
    assert output["artifact"]["diagram"] == {"$ref": "state.mermaid"}
    # The narrative still goes to the model.
    assert output["summary"] == {"$ref": "state.summary"}
    # The diagram travels as an artifact, not as a top-level output field.
    assert "mermaid" not in output
