"""How a process's output is split between the artifact pane and the model."""

import asyncio
import json

from olit.drivers.loop.tools import ToolSurface
from olit.registry import ProcessRegistry, load_primitives

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
    return {
        "version": 1,
        "id": "p",
        "kind": "agent_pipeline",
        "start": "done",
        "nodes": {"done": {"type": "terminal", "output": output}},
    }


def _run(surface):
    return json.loads(asyncio.run(surface.dispatch("p", {})).text)


def test_artifact_is_routed_out_of_band_and_reduced_to_a_reference():
    surface = _surface(
        _terminal_graph(
            {
                "artifact": {"kind": "mermaid", "title": "Dataset lineage", "diagram": "graph TD; A-->B"},
            }
        )
    )
    payload = _run(surface)

    # The model gets kind + title only.
    assert payload["ok"] is True
    assert payload["artifact"] == {"kind": "mermaid", "title": "Dataset lineage"}
    assert "diagram" not in payload["artifact"]
    # The shell gets the whole thing.
    assert surface.artifacts == [{"kind": "mermaid", "title": "Dataset lineage", "diagram": "graph TD; A-->B"}]


def test_sibling_output_fields_travel_with_the_artifact_reference():
    """The lineage_report shape: a narrative the model needs, plus a diagram it does not."""
    surface = _surface(
        _terminal_graph(
            {
                "summary": "Produced by bwa_mem then samtools_sort.",
                "truncated": False,
                "artifact": {"kind": "mermaid", "title": "Dataset lineage", "diagram": "graph TD; A-->B"},
            }
        )
    )
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


class _GraphCatalog:
    """Answers the one graph op lineage_report calls, and records the request."""

    def __init__(self, graph):
        self.graph = graph
        self.calls = []

    async def call(self, target, input=None):
        self.calls.append((target, input or {}))
        return {"ok": True, "result": self.graph}


class _GraphManifest:
    def allows(self, *_):
        return True

    def __contains__(self, _):
        return True


class _GraphSubstrate:
    def __init__(self, graph):
        self.catalog = _GraphCatalog(graph)
        self.manifest = _GraphManifest()

    def scoped(self, capabilities):
        return self


GRAPH = {
    "nodes": [
        {"src": "hda", "id": "d1", "name": "reads.fastq"},
        {"src": "job", "id": "j1", "tool_id": "bwa_mem", "tool_name": "BWA-MEM"},
        {"src": "hda", "id": "d2", "name": "aligned.bam"},
    ],
    "edges": [
        {"source": {"src": "hda", "id": "d1"}, "target": {"src": "job", "id": "j1"}, "type": "dataset_input"},
        {"source": {"src": "job", "id": "j1"}, "target": {"src": "hda", "id": "d2"}, "type": "dataset_output"},
    ],
    "truncated": {"item_count_capped": False},
}


def test_lineage_report_declares_its_diagram_as_a_mermaid_artifact():
    """Guards the wiring the shell's mermaid renderer depends on."""
    proc = ProcessRegistry().load_packaged().get("lineage_report")
    substrate = _GraphSubstrate(GRAPH)
    output = asyncio.run(proc.run(substrate, {"history_id": "h1", "dataset_id": "d2"}))["last"]["result"]

    assert output["artifact"]["kind"] == "mermaid"
    assert output["artifact"]["title"] == "Dataset lineage"
    assert output["artifact"]["diagram"].startswith("flowchart TD")
    # The graph the model reasons over travels alongside the diagram.
    assert [n["id"] for n in output["nodes"]] == ["d1", "j1", "d2"]
    assert len(output["edges"]) == 2
    # Galaxy states truncation; the process does not infer it.
    assert output["truncated"] == {"item_count_capped": False}
    # The diagram is not also a top-level output field.
    assert "mermaid" not in output


def test_lineage_report_asks_galaxy_to_walk_backward_from_the_seed():
    """The traversal is the endpoint's job now, not the client's."""
    proc = ProcessRegistry().load_packaged().get("lineage_report")
    substrate = _GraphSubstrate(GRAPH)
    asyncio.run(proc.run(substrate, {"history_id": "h1", "dataset_id": "d2", "depth": 2}))

    target, sent = substrate.catalog.calls[0]
    assert target == "galaxy.histories.show.graph.get"
    assert sent["seed_src"] == "hda"
    assert sent["seed_id"] == "d2"
    assert sent["direction"] == "backward"
    assert sent["depth"] == 2
    # One call: no per-node walk.
    assert len(substrate.catalog.calls) == 1


def test_the_lineage_diagram_reaches_the_shell_and_not_the_model():
    """End to end: the flowchart source must never enter the context."""
    from olit.drivers.loop.tools import ToolSurface

    substrate = _GraphSubstrate(GRAPH)
    surface = ToolSurface(substrate, ProcessRegistry().load_packaged())
    text = asyncio.run(surface.dispatch("lineage_report", {"history_id": "h1", "dataset_id": "d2"}))

    assert surface.artifacts and surface.artifacts[0]["kind"] == "mermaid"
    assert "flowchart TD" in surface.artifacts[0]["diagram"]
    assert "flowchart TD" not in str(text)
