"""Planner behaviour when the model's reply does not match the built schema."""

import asyncio
from olit.substrate.llm import Reply
import csv
import io
import json
import os

from olit.drivers.graph import GraphDriver
from olit.drivers.graph.constants import PLANNER_MAX_ATTEMPTS, ErrorCode
from olit.registry import ProcessRegistry

from olit.registry import load_primitives

load_primitives()

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def _csv_from_rows(rows):
    cols = list(rows[0].keys())
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow(["" if r.get(c) is None else r.get(c) for c in cols])
    return buf.getvalue()


def _fixture_csv():
    with open(os.path.join(FIXTURES, "scatter_bmi_glucose.json")) as f:
        return _csv_from_rows(json.load(f)["data"]["values"])


class FakeCatalog:
    def __init__(self, csv_text):
        self.csv_text = csv_text

    async def call(self, target, input=None):
        if target.endswith(".display.get"):
            return {"ok": True, "result": self.csv_text}
        return {"ok": True, "result": {"id": "d1", "name": "table.csv", "state": "ok"}}


class ScriptedLlm:
    """Answers each decision from a queue, so a reply can be wrong then corrected."""

    def __init__(self, scripts):
        # {decision: [reply, ...]} — the last reply repeats once the queue drains.
        self.scripts = {k: list(v) for k, v in scripts.items()}
        self.asked = []

    async def complete(self, messages, tools=None, **kwargs):
        content = messages[-1].get("content", "") if messages else ""
        if '"shellId"' in content:
            key = "shell"
        elif '"extract_fields"' in content:
            key = "intent"
        elif '"none"' in content:
            key = "extract"
        else:
            key = "fill"
        self.asked.append(key)
        queue = self.scripts[key]
        reply = queue.pop(0) if len(queue) > 1 else queue[0]
        return Reply(content=json.dumps(reply))


class FakeManifest:
    def allows(self, capability):
        return False


class FakeSubstrate:
    def __init__(self, csv_text, scripts):
        self.catalog = FakeCatalog(csv_text)
        self.llm = ScriptedLlm(scripts)
        self.manifest = FakeManifest()


def _run(csv_text, scripts):
    proc = ProcessRegistry().load_packaged().get("vintent_dataset")
    substrate = FakeSubstrate(csv_text, scripts)
    result = asyncio.run(
        GraphDriver(substrate).run(proc.graph, {"dataset_id": "d1", "request": "scatter BMI vs Glucose"})
    )
    return result, substrate.llm


# Glucose is quantitative, so it is absent from color's nominal-only enum.
BAD_THEN_GOOD = {
    "intent": [{"goal": "relationship", "shell_fields": ["BMI", "Glucose"], "extract_fields": []}],
    "extract": [{"id": "none"}],
    "shell": [{"shellId": "scatter"}],
    "fill": [
        {"x": "BMI", "y": "Glucose", "color": "Glucose"},
        {"x": "BMI", "y": "Glucose", "color": "Obesity"},
    ],
}


def test_planner_retries_an_out_of_enum_reply_and_completes():
    result, llm = _run(_fixture_csv(), BAD_THEN_GOOD)

    last = result.get("last") or {}
    assert last.get("ok"), f"graph should recover from the rejected reply: {last}"
    spec = last["result"]["artifact"]["spec"]
    assert spec["encoding"]["color"]["field"] == "Obesity"
    # The retry re-asked the same decision rather than advancing the graph.
    assert llm.asked.count("fill") == 2


def test_retry_prompt_quotes_the_rejected_value_and_the_reason():
    captured = []

    class CapturingLlm(ScriptedLlm):
        async def complete(self, messages, tools=None, **kwargs):
            captured.append(messages[-1].get("content", ""))
            return await super().complete(messages, tools)

    proc = ProcessRegistry().load_packaged().get("vintent_dataset")
    substrate = FakeSubstrate(_fixture_csv(), BAD_THEN_GOOD)
    substrate.llm = CapturingLlm(BAD_THEN_GOOD)
    asyncio.run(GraphDriver(substrate).run(proc.graph, {"dataset_id": "d1", "request": "x"}))

    repair = [c for c in captured if "was rejected" in c]
    assert repair, "a repair prompt should have been issued"
    assert "color" in repair[0]
    assert "Glucose" in repair[0]  # the rejected value is quoted back
    assert "Obesity" in repair[0]  # the legal options are still in the schema


def test_planner_gives_up_after_max_attempts_and_reports_the_count():
    always_bad = dict(BAD_THEN_GOOD, fill=[{"x": "BMI", "y": "Glucose", "color": "Glucose"}])
    result, llm = _run(_fixture_csv(), always_bad)

    last = result.get("last") or {}
    assert last.get("ok") is False
    assert last["error"]["code"] == ErrorCode.PLANNER_SCHEMA_VALIDATION_FAILED
    assert last["error"]["details"]["attempts"] == PLANNER_MAX_ATTEMPTS
    assert llm.asked.count("fill") == PLANNER_MAX_ATTEMPTS


def test_unplottable_data_fails_at_the_decision_not_at_compile():
    """An empty dataset must be refused where the contract cannot be built."""
    result, _ = _run("\n", BAD_THEN_GOOD)

    last = result.get("last") or {}
    assert last.get("ok") is False
    assert last["error"]["code"] == ErrorCode.PLANNER_SCHEMA_BUILD_FAILED
    assert "unknown shell: None" not in last["error"]["message"]
    assert "no columns" in last["error"]["message"]


def test_fill_params_builder_rejects_an_unknown_shell():
    from olit.registry.extensions.vintent.bridge import _fill_params_schema

    profile = {"fields": {"a": {"type": "quantitative"}}, "row_count": 1}
    try:
        _fill_params_schema(shell_id=None, profile=profile, intent=None)
    except ValueError as e:
        assert "unknown shell" in str(e)
    else:
        raise AssertionError("a missing shell id must be refused, not answered with an empty schema")
