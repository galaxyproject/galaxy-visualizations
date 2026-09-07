"""End-to-end tests for the absorbed vintent pipeline as an olite graph process."""

import asyncio
from olite.substrate.llm import Reply
import csv
import io
import json
import os

from olite.drivers.graph import GraphDriver
from olite.registry import ProcessRegistry, SkillRegistry
from olite.registry.extensions.vintent.modules.profiler import profile_rows, rows_from_tabular
from olite.registry.extensions.vintent.modules.process import run_process as leaf_run_process
from olite.registry.extensions.vintent.modules.registry import PROCESSES, SHELLS

from olite.registry import load_primitives

load_primitives()

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def _scatter_fixture():
    with open(os.path.join(FIXTURES, "scatter_bmi_glucose.json")) as f:
        return json.load(f)


def _csv_from_rows(rows):
    cols = list(rows[0].keys())
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow(["" if r.get(c) is None else r.get(c) for c in cols])
    return buf.getvalue()


class FakeCatalog:
    """Scoped catalog: returns the dataset content for the display op."""

    def __init__(self, csv_text):
        self.csv_text = csv_text
        self.calls = []

    async def call(self, target, input=None):
        self.calls.append((target, input))
        return {"ok": True, "result": self.csv_text}


class FakeLlm:
    """Answers each graph decision by inspecting the schema it is handed."""

    def __init__(self, decisions):
        self.decisions = decisions

    async def complete(self, messages, tools=None, **kwargs):
        content = messages[-1].get("content", "") if messages else ""
        if '"shellId"' in content:
            d = self.decisions["shell"]
        elif '"extract_fields"' in content:
            d = self.decisions["intent"]
        elif '"none"' in content:
            d = self.decisions.get("extract", {"id": "none"})
        else:
            d = self.decisions["fill"]
        return Reply(content=json.dumps(d))


class FakeManifest:
    def allows(self, capability):
        return False


class FakeSubstrate:
    def __init__(self, csv_text, decisions):
        self.catalog = FakeCatalog(csv_text)
        self.llm = FakeLlm(decisions)
        self.manifest = FakeManifest()

    def scoped(self, capabilities):
        # Orchestration is what these tests are about; the real narrowing is covered
        return self


def _load_process():
    return ProcessRegistry().load_packaged().get("vintent_dataset")


def _run_graph(csv_text, decisions):
    proc = _load_process()
    assert proc is not None, "vintent_dataset process not registered"
    substrate = FakeSubstrate(csv_text, decisions)
    result = asyncio.run(GraphDriver(substrate).run(proc.graph, {"dataset_id": "d1", "request": "chart it"}))
    last = result.get("last") or {}
    assert last.get("ok"), f"graph did not complete cleanly: {last}"
    return last["result"]


def _leaf_reference(csv_text, shell_id, params):
    """What vintent's own leaves produce directly (profile -> analyze -> compile)."""
    values = rows_from_tabular(csv_text)
    shell = SHELLS[shell_id]
    steps = getattr(shell, "processes", None)
    if callable(steps):
        for step in steps(profile_rows(values), params):
            values = leaf_run_process(PROCESSES.ANALYZE[step["id"]], values, step["params"])
    return shell.compile(params, values, "vega-lite")


DECISIONS = {
    "scatter": {
        "intent": {"goal": "relationship", "shell_fields": ["BMI", "Glucose"], "extract_fields": []},
        "extract": {"id": "none"},
        "shell": {"shellId": "scatter"},
        "fill": {"x": "BMI", "y": "Glucose"},
    },
    "histogram": {
        "intent": {"goal": "distribution", "shell_fields": ["Glucose"], "extract_fields": []},
        "extract": {"id": "none"},
        "shell": {"shellId": "histogram"},
        "fill": {"field": "Glucose"},
    },
    "bar_aggregate": {
        "intent": {"goal": "comparison", "shell_fields": ["Obesity", "Glucose"], "extract_fields": []},
        "extract": {"id": "none"},
        "shell": {"shellId": "bar_aggregate"},
        "fill": {"group_by": "Obesity", "metric": "Glucose", "op": "mean"},
    },
}


def test_scatter_matches_vintent_expected_output_exactly():
    expected = _scatter_fixture()
    csv_text = _csv_from_rows(expected["data"]["values"])
    out = _run_graph(csv_text, DECISIONS["scatter"])
    spec = out["artifact"]["spec"]
    assert spec["mark"] == expected["mark"]
    assert spec["encoding"] == expected["encoding"]
    assert spec["$schema"] == expected["$schema"]
    assert spec["data"]["values"] == expected["data"]["values"]


def test_histogram_graph_equals_leaf_orchestration():
    csv_text = _csv_from_rows(_scatter_fixture()["data"]["values"])
    out = _run_graph(csv_text, DECISIONS["histogram"])
    spec = out["artifact"]["spec"]
    assert spec == _leaf_reference(csv_text, "histogram", DECISIONS["histogram"]["fill"])
    assert spec["mark"] == {"type": "bar"}
    assert spec["encoding"]["x"]["field"] == "bin_label"


def test_bar_aggregate_graph_equals_leaf_orchestration():
    csv_text = _csv_from_rows(_scatter_fixture()["data"]["values"])
    out = _run_graph(csv_text, DECISIONS["bar_aggregate"])
    spec = out["artifact"]["spec"]
    assert spec == _leaf_reference(csv_text, "bar_aggregate", DECISIONS["bar_aggregate"]["fill"])
    assert spec["encoding"]["x"]["field"] == "Obesity"


def test_artifact_envelope_shape():
    csv_text = _csv_from_rows(_scatter_fixture()["data"]["values"])
    out = _run_graph(csv_text, DECISIONS["scatter"])
    assert set(out.keys()) == {"artifact"}
    art = out["artifact"]
    assert art["kind"] == "vega-lite"
    assert art["title"] == "Scatter Plot"
    assert "spec" in art


def test_fetch_uses_scoped_catalog_display_op():
    csv_text = _csv_from_rows(_scatter_fixture()["data"]["values"])
    proc = _load_process()
    substrate = FakeSubstrate(csv_text, DECISIONS["scatter"])
    asyncio.run(GraphDriver(substrate).run(proc.graph, {"dataset_id": "f2db41e1fa331b3e", "request": "x"}))
    assert substrate.catalog.calls == [
        ("galaxy.datasets.show.display.get", {"history_content_id": "f2db41e1fa331b3e"})
    ]


def test_run_process_surfaces_graph_failure_not_null():
    """A failed fetch must reach the model as an error, not a bare null."""
    from olite.drivers.loop.tools import ToolSurface

    class BrokenCatalog:
        async def call(self, target, input=None):
            return {"ok": False, "error": {"code": "catalog_unavailable", "message": "spec did not load"}}

    class Sub:
        catalog = BrokenCatalog()
        manifest = FakeManifest()

        class llm:  # unused; the graph fails at fetch before any decision
            pass

        def scoped(self, capabilities):
            return self

    surface = ToolSurface(Sub(), ProcessRegistry().load_packaged())
    inputs = {"dataset_id": "d1", "request": "scatter x vs y"}
    out = asyncio.run(surface.dispatch("run_process", {"name": "vintent_dataset", "inputs": inputs})).text
    payload = json.loads(out)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "catalog_unavailable"


def test_a_process_called_without_a_required_input_says_which_one():
    """Caught before the graph runs, so the error names the caller's mistake."""
    from olite.drivers.loop.tools import ToolSurface

    class Sub:
        manifest = FakeManifest()

        def scoped(self, capabilities):
            return self

    surface = ToolSurface(Sub(), ProcessRegistry().load_packaged())
    out = asyncio.run(surface.dispatch("run_process", {"name": "vintent_dataset", "inputs": {"dataset_id": "d1"}})).text
    payload = json.loads(out)
    assert payload["error"]["code"] == "missing_inputs"
    assert "request" in payload["error"]["message"]


def test_choose_shell_and_fill_schemas_are_state_derived():
    """The decision contracts come from the live profile, not the yaml."""
    from olite.registry.extensions.vintent.bridge import _choose_shell_schema, _fill_params_schema

    profile = profile_rows(rows_from_tabular(_csv_from_rows(_scatter_fixture()["data"]["values"])))
    shell_enum = _choose_shell_schema(profile=profile)["properties"]["shellId"]["enum"]
    assert "scatter" in shell_enum and "histogram" in shell_enum
    x_enum = _fill_params_schema(shell_id="scatter", profile=profile)["properties"]["x"]["enum"]
    assert "BMI" in x_enum and "Glucose" in x_enum


# --- full loop: artifact channel + skill injection --------------------------


class LoopLlm:
    """A loop-level model: calls run_process once, then finishes."""

    def __init__(self, decisions):
        self.decisions = decisions
        self.loop_calls = 0

    async def complete(self, messages, tools=None, **kwargs):
        if tools is None:
            return await FakeLlm(self.decisions).complete(messages)
        self.loop_calls += 1
        if self.loop_calls == 1:
            call = {
                "id": "call_1",
                "type": "function",
                "function": {
                    "name": "run_process",
                    "arguments": json.dumps(
                        {"name": "vintent_dataset", "inputs": {"dataset_id": "d1", "request": "scatter BMI vs Glucose"}}
                    ),
                },
            }
            return Reply(tool_calls=[call])
        return Reply(content="Here is your chart.")


def test_full_loop_routes_artifact_and_injects_skill():
    from olite.runtime import _inject_context, run

    csv_text = _csv_from_rows(_scatter_fixture()["data"]["values"])
    substrate = FakeSubstrate(csv_text, DECISIONS["scatter"])
    substrate.llm = LoopLlm(DECISIONS["scatter"])

    # Skill injection: the ROUTER lands in the system message (not the bodies).
    skill_text = SkillRegistry().load_packaged().router_text()
    injected = _inject_context([{"role": "system", "content": "base"}], skill_text)
    assert "visualization" in injected[0]["content"]
    assert injected[0]["content"].startswith("base")
    # Idempotent: re-injecting the persisted transcript does not duplicate the skill.
    reinjected = _inject_context(injected, skill_text)
    assert reinjected[0]["content"] == injected[0]["content"]

    # Drive the loop directly over the fake substrate (bypassing Substrate build).
    from olite.drivers import LoopDriver

    driver = LoopDriver(substrate, ProcessRegistry().load_packaged())
    transcripts = [
        {"role": "system", "content": "You are olite."},
        {"role": "user", "content": "scatter BMI vs Glucose"},
    ]
    events = []
    result = asyncio.run(driver.run(transcripts, events.append))

    # Live progress: each tool call emits a start then an end with the same id.
    starts = [e for e in events if e["type"] == "tool_start"]
    ends = [e for e in events if e["type"] == "tool_end"]
    assert starts and len(starts) == len(ends)
    assert [e["id"] for e in starts] == [e["id"] for e in ends]
    assert any(e["name"] == "run_process" for e in starts)
    assert all("content" in e for e in ends)

    artifacts = result.get("artifacts") or []
    assert len(artifacts) == 1
    assert artifacts[0]["kind"] == "vega-lite"
    assert artifacts[0]["spec"]["mark"] == {"type": "point"}

    # The model saw a compact reference, not the full spec.
    tool_msgs = [m for m in result["messages"] if m.get("role") == "tool" and m.get("name") == "run_process"]
    assert tool_msgs, "no run_process tool result in transcript"
    payload = json.loads(tool_msgs[0]["content"])
    assert payload["artifact"] == {"kind": "vega-lite", "title": "Scatter Plot"}
    assert "spec" not in payload["artifact"]


def test_unfence_unwraps_planner_json_code_fences():
    from olite.drivers.graph.registry import _unfence

    # Models routinely wrap structured output in a markdown code fence; the planner
    assert _unfence('```json\n{"shellId": "area_chart"}\n```') == '{"shellId": "area_chart"}'
    assert _unfence('```\n{"nolang": true}\n```') == '{"nolang": true}'
    # Fence-free content passes through unchanged.
    assert _unfence('{"already": "clean"}') == '{"already": "clean"}'
