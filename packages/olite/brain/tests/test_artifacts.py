"""Placing an artifact into a page.

A chart's spec is stripped from the tool result before the model sees it, so the model
cannot paste one into a page. It writes a token instead and the dispatcher resolves it.
"""

import json

from olite.drivers.loop import artifacts

VEGA = {"kind": "vega-lite", "title": "Glucose by BMI", "spec": {"mark": "point"}}
VIZ = {"kind": "visualization", "title": "atlas of d1", "visualization": "atlas", "dataset_id": "d1"}
LINEAGE = {"kind": "mermaid", "title": "Dataset lineage", "diagram": "graph TD;\nA-->B;"}


def test_a_vega_artifact_becomes_a_vega_cell_holding_its_spec():
    out = artifacts.render(VEGA)
    assert out.startswith("```vega\n") and out.endswith("\n```")
    assert json.loads(out.split("\n", 1)[1].rsplit("\n```", 1)[0]) == {"mark": "point"}


def test_a_mermaid_artifact_becomes_a_mermaid_cell():
    assert artifacts.render(LINEAGE) == "```mermaid\ngraph TD;\nA-->B;\n```"


def test_a_kind_with_no_renderer_is_refused_rather_than_written_broken():
    text, refusal = artifacts.resolve("{{artifact}}", [{"kind": "hologram", "title": "x"}])
    assert text == "{{artifact}}"
    assert "'hologram'" in refusal and "mermaid" in refusal


def test_the_token_keeps_the_prose_around_it():
    text, refusal = artifacts.resolve("Before.\n\n{{artifact}}\n\nAfter.", [VEGA])
    assert refusal is None
    assert text.startswith("Before.\n\n```vega") and text.endswith("```\n\nAfter.")


def test_a_bare_token_takes_the_most_recent_artifact():
    text, _ = artifacts.resolve("{{artifact}}", [VEGA, LINEAGE])
    assert text.startswith("```mermaid")


def test_a_titled_token_takes_the_one_it_names():
    text, _ = artifacts.resolve("{{artifact: Glucose by BMI}}", [VEGA, LINEAGE])
    assert text.startswith("```vega")


def test_several_tokens_each_resolve_in_one_write():
    text, refusal = artifacts.resolve("{{artifact: Dataset lineage}}\n{{artifact: Glucose by BMI}}",
                                      [VEGA, LINEAGE])
    assert refusal is None
    assert text.index("```mermaid") < text.index("```vega")


def test_an_unknown_title_is_refused_and_names_what_there_is():
    text, refusal = artifacts.resolve("{{artifact: Nothing}}", [VEGA])
    assert text == "{{artifact: Nothing}}"
    assert "'Nothing'" in refusal and "Glucose by BMI" in refusal


def test_a_token_with_no_artifacts_yet_is_refused():
    _, refusal = artifacts.resolve("{{artifact}}", [])
    assert "No artifact has been produced" in refusal


def test_text_without_a_token_is_left_exactly_as_written():
    assert artifacts.resolve("plain content", [VEGA]) == ("plain content", None)


def test_non_string_arguments_pass_through():
    assert artifacts.resolve(7, [VEGA]) == (7, None)
    assert artifacts.resolve({"a": 1}, [VEGA]) == ({"a": 1}, None)


def test_every_artifact_olite_produces_has_a_renderer():
    """A new artifact kind is a renderer entry; this fails until one is added."""
    assert set(artifacts.RENDERERS) >= {"vega-lite", "visualization", "mermaid"}


class _Manifest:
    def allows(self, capability):
        return True


class _Substrate:
    def __init__(self, seen):
        self.manifest = _Manifest()
        self.galaxy = _Galaxy(seen)

    def scoped(self, capabilities):
        return self


class _Galaxy:
    def __init__(self, seen):
        self.seen = seen

    async def get(self, path):
        return {"content": "", "id": "p1"}

    async def put(self, path, payload):
        self.seen.append(payload)
        return {"content": payload.get("content", "")}


def _dispatch(content, held):
    """update_page through the real dispatcher, with `held` already produced this session."""
    import asyncio

    from olite.drivers.loop.tools import ToolSurface

    seen = []
    surface = ToolSurface(_Substrate(seen), None)
    surface.artifacts.extend(held)
    outcome = asyncio.run(surface.dispatch("update_page", {"page_id": "p1", "content": content}))
    return seen, outcome


def test_the_page_receives_the_markdown_not_the_token():
    seen, _ = _dispatch("Summary.\n\n{{artifact}}", [VEGA])
    assert len(seen) == 1
    assert "{{artifact}}" not in seen[0]["content"]
    assert '"mark": "point"' in seen[0]["content"]


def test_a_token_naming_nothing_refuses_before_the_page_is_touched():
    seen, outcome = _dispatch("{{artifact: Missing}}", [VEGA])
    assert seen == [], "the page was written despite the refusal"
    assert getattr(outcome, "is_error", False)
    assert "Missing" in outcome.text


def test_a_chart_from_an_earlier_turn_is_still_placeable():
    """One surface per turn, but the artifact pane spans the session and so must placement.

    "Chart this" and "now put that in my record" are two turns; resolving only against the
    current turn's artifacts refuses the second. The earlier turn's artifacts are handed in
    by the caller, because the driver is rebuilt whenever the session's config changes and
    anything it held would not survive a model switch.
    """
    import asyncio

    from olite.drivers.loop.tools import ToolSurface

    seen = []
    substrate = _Substrate(seen)
    first = ToolSurface(substrate, None)
    first._claim_artifact({"artifact": dict(VEGA)})

    later = ToolSurface(substrate, None, prior=first.artifacts)
    asyncio.run(later.dispatch("update_page", {"page_id": "p1", "content": "{{artifact}}"}))

    assert '"mark": "point"' in seen[0]["content"]
    # The turn reports only what it produced, so the pane does not show the chart twice.
    assert later.artifacts == []


def test_the_driver_keeps_nothing_between_turns():
    """A model or history switch rebuilds the session; state kept here would vanish with it."""
    from olite.drivers.loop.agent import LoopDriver

    class _Llm:
        target = None

    class _Sub:
        llm = _Llm()
        config = {}

    driver = LoopDriver(_Sub())
    assert not hasattr(driver, "artifacts"), "artifacts belong to the caller, not to the driver"


def test_the_hint_at_production_names_the_token():
    """The model is told how to keep a chart where the chart is made.

    The hint read "Describe what it shows and finish", so a record written a turn later
    held the prose and not the chart.
    """
    from olite.drivers.loop.tools import ARTIFACT_HINT

    assert "{{artifact}}" in ARTIFACT_HINT
