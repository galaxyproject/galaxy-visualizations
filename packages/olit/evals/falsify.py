#!/usr/bin/env python3
"""Prove a scenario can fail.

A scenario that has never failed is an untested test. Both scenarios written on
2026-09-17 passed against deliberately broken code before they earned their place -- once
because they targeted a code path that was never broken, once because the assertion's own
fallback masked the defect. Neither was visible from reading them.

So each assertion family here names a break in *product* code that should make the
scenarios using it go red. Breaking the grader instead would only test the grader against
itself, which is the mistake this file exists to avoid.

Usage:
    GALAXY_URL=... GALAXY_API_KEY=... python3 evals/falsify.py [--model ID] [family ...]

The working tree is restored with `git checkout` after every break, including on failure
or interrupt: this edits real source, so it must never leave the tree broken.
"""

import argparse
import json
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
BRAIN = ROOT / "brain"


class Break:
    """One targeted defect, the scenarios it should sink, and the assertion that catches it."""

    def __init__(self, family, why, scenarios, expect, path=None, find=None, replace=None,
                 edits=None):
        self.family = family
        self.why = why
        self.scenarios = scenarios
        self.expect = expect
        self.edits = edits or [(path, find, replace)]

    def _paths(self):
        return sorted({ROOT / path for path, _, _ in self.edits})

    def apply(self):
        for path, find, replace in self.edits:
            target = ROOT / path
            source = target.read_text()
            found = source.count(find)
            if found != 1:
                self.restore()
                raise SystemExit(
                    f"{self.family}: anchor appears {found} times in {target.name}; "
                    "the break is stale and would patch the wrong thing"
                )
            target.write_text(source.replace(find, replace))

    def restore(self):
        for target in self._paths():
            subprocess.run(["git", "checkout", "--", str(target)], cwd=ROOT, check=True)


BREAKS = [
    Break(
        family="artifacts",
        why="a produced chart is never handed to the shell, so nothing renders for the user",
        path="brain/olit/drivers/loop/tools.py",
        find="            self.artifacts.append(art)",
        replace="            pass  # FALSIFY: artifact dropped",
        scenarios=["chart-bar-groups-by-category", "chart-histogram-embeds-bins",
                   "chart-scatter-references-dataset", "chart-treemap-embeds-layout"],
        expect=["artifacts.kind", "artifacts.mustInclude"],
    ),
    Break(
        family="record.write",
        why="the page write is dropped, so the agent reports saving and nothing lands",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find='    return await g.put(f"api/pages/{a[\'page_id\']}", payload)',
        replace='    return {"id": a["page_id"], "ok": True}  # FALSIFY: write dropped',
        scenarios=["record-page-holds-content", "research-glucose-bmi"],
        expect=["record.notEmpty", "record.mustMention"],
    ),
    Break(
        family="record.format",
        why="a page created without a content format is stored as html and opens empty",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find='    payload["content_format"] = "markdown"',
        replace="    pass  # FALSIFY: format omitted",
        scenarios=["report-page-holds-content"],
        expect=["record.editable", "record.notEmpty", "record.mustMention"],
    ),
    Break(
        family="chatText",
        why="only the preview is downloaded, so a sum over it is quietly wrong",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find="MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024",
        replace="MAX_DOWNLOAD_BYTES = 512  # FALSIFY: truncated download",
        scenarios=["dataset-analysis-sum"],
        expect=["chatText.mustInclude"],
    ),
    Break(
        family="toolCount",
        why="the panel is returned raw, so the model counts sections instead of tools",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find='    return {"tool_count": tools, "section_count": sections, "panel": panel}',
        replace="    return panel  # FALSIFY: no count",
        scenarios=["instance-tool-count"],
        expect=["chatText.mustMatch", "chatText.mustNotMatch", "run.noModelOutput"],
    ),
    Break(
        family="planGate",
        why="the approval-gate convention is dropped from the prompt, so nothing holds "
            "the agent back from acting before the user has agreed",
        path="brain/olit/prompt.py",
        find="    return PLAN_CONVENTION",
        replace='    return ""  # FALSIFY: gate removed',
        scenarios=["gate-holds-before-approval"],
        expect=["behavior.doesNotExecute", "plan.exists", "plan.routingIn"],
    ),
    Break(
        family="toolInputs",
        why="run_tool submits no inputs, so the job produces something that is not the "
            "answer while the agent reports success",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find='        {"history_id": a["history_id"], "tool_id": a["tool_id"], "inputs": a.get("inputs") or {}},',
        replace='        {"history_id": a["history_id"], "tool_id": a["tool_id"], "inputs": {}},  # FALSIFY',
        scenarios=["analysis-cat-two-datasets"],
        expect=["toolOutput.matchesToolTest", "toolOutput.produced", "toolOutput.honestReport"],
    ),
    Break(
        family="chatReply",
        why="the assistant's words never reach the transcript, so the user is answered "
            "with silence. Sinks every scenario, so it is only pointed at the canary",
        path="brain/olit/drivers/loop/agent.py",
        find='                "content": reply.content,',
        replace='                "content": "",  # FALSIFY: reply dropped',
        scenarios=["smoke-answers"],
        expect=["messages.repliesInChat", "run.noModelOutput"],
    ),
    Break(
        family="destructiveGate",
        why="nothing is classified as destructive, so a purge request runs unchallenged "
            "and the user's data is gone",
        path="brain/olit/drivers/loop/galaxy_destructive.py",
        find='DESTRUCTIVE_OPS = {"update_history": _update_history}',
        replace="DESTRUCTIVE_OPS = {}  # FALSIFY: gate disarmed",
        scenarios=["gate-refuses-destructive"],
        expect=["history.intact", "behavior.doesNotExecute"],
    ),
    Break(
        family="jobState",
        why="a history listing hides datasets in an error state, the 'clean view' bug: the "
            "failed job is not merely unexplained, it is absent, so the agent reports a "
            "tidy history that is not the one the researcher has",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find="""    return await g.get(f"api/histories/{a['history_id']}/contents{_q(params)}")""",
        replace="""    items = await g.get(f"api/histories/{a['history_id']}/contents{_q(params)}")  # FALSIFY
    return ([i for i in items if (i or {}).get("state") != "error"]
            if isinstance(items, list) else items)""",
        scenarios=["reports-a-failed-job", "refuses-to-analyse-failed-data"],
        expect=["chatText.mustMatch", "chatText.mustNotMatch"],
    ),
    Break(
        family="emptyResult",
        why="dataset metadata is never refreshed after the job, so the empty output "
            "still reports the input's row count and size. A stale-metadata bug rather "
            "than a missing field: removing the size signals only sends the agent to the "
            "next place Galaxy states them, and it reads the truth there. Here every "
            "place agrees, and agrees wrongly",
        edits=[
            ("brain/olit/drivers/loop/galaxy_tools.py", 'PREVIEW_LINES = 50', 'PREVIEW_LINES = 50\n\n\ndef _falsify_stale(item):  # FALSIFY: metadata never refreshed after the job\n    if not isinstance(item, dict):\n        return item\n    out = dict(item)\n    for key in ("misc_info", "misc_blurb", "blurb", "peek", "preview"):\n        out.pop(key, None)\n    if "metadata_data_lines" in out:\n        out["metadata_data_lines"] = 768\n    if "file_size" in out:\n        out["file_size"] = 33000\n    return out'),
            ("brain/olit/drivers/loop/galaxy_tools.py", '    return dataset\n\n\n_STR = {"type": "string"}', '    return _falsify_stale(dataset)\n\n\n_STR = {"type": "string"}'),
            ("brain/olit/drivers/loop/galaxy_tools.py", '    return await g.get(f"api/histories/{a[\'history_id\']}/contents{_q(params)}")', '    _items = await g.get(f"api/histories/{a[\'history_id\']}/contents{_q(params)}")\n    return ([_falsify_stale(i) for i in _items] if isinstance(_items, list) else _items)'),
        ],
        scenarios=["notices-an-empty-result"],
        expect=["chatText.mustMatch"],
    ),
    Break(
        family="galaxyExecution",
        why="run_tool reports success without submitting anything, so no job runs and no "
            "dataset appears. The agent can still reach the right number in the browser "
            "scratchpad, which is the substitution this scenario exists to catch: an answer "
            "that is correct and unreproducible",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find='async def _run_tool(g, a):\n    return await g.post(\n        "api/tools",\n        {"history_id": a["history_id"], "tool_id": a["tool_id"], "inputs": a.get("inputs") or {}},\n    )',
        replace='async def _run_tool(g, a):\n    return {"outputs": [], "jobs": [{"state": "ok"}]}  # FALSIFY: nothing submitted',
        scenarios=["gtn-tutorial-completed"],
        expect=["history.producedDatasets"],
    ),
    Break(
        family="workflowInvoke",
        why="invoke_workflow posts no inputs, so Galaxy accepts the request and the "
            "invocation never schedules. The agent still sees a 2xx and reports success, "
            "which is exactly why this is graded against the invocation record rather than "
            "against the chat",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find='    body = {"inputs": a.get("inputs") or {}, "inputs_by": a.get("inputs_by", "step_index")}',
        replace='    body = {"inputs": {}, "inputs_by": "step_index"}  # FALSIFY: inputs dropped',
        scenarios=["workflow-runs-end-to-end"],
        expect=["invocation.succeeded", "invocation.producesDatasets", "invocation.exists"],
    ),
    Break(
        family="visualizationSaved",
        why="save_visualization reports success without posting anything, so the agent "
            "shows a viewer in the artifact pane and says the structure is saved while "
            "Galaxy holds no such object. The artifact assertion still passes, which is "
            "the point: a pane is not a saved visualization, and only grading against "
            "Galaxy separates the two",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find="""    created = await g.post("api/visualizations",
                           {"type": name, "title": title, "config": _visualization_config(a)})""",
        replace='    created = {"id": "0" * 16}  # FALSIFY: nothing saved',
        scenarios=["viz-structure-saved"],
        expect=["visualization.exists"],
    ),
    Break(
        family="visualizationArtifact",
        why="the artifact is serialized into the tool result instead of being claimed, so "
            "it never reaches the shell and the user sees no viewer. The saved Galaxy "
            "object is untouched and the chat still describes it, so only the artifact "
            "assertion moves: the mirror of visualizationSaved",
        path="brain/olit/drivers/loop/tools.py",
        find="            result = self._claim_artifact(await handler(self.substrate.galaxy, args))\n            return json.dumps(result, default=str)",
        replace="            return json.dumps(await handler(self.substrate.galaxy, args), default=str)  # FALSIFY",
        scenarios=["viz-structure-shown", "viz-structure-saved"],
        expect=["artifacts.kind"],
    ),
    Break(
        family="visualizationSpared",
        why="showing a visualization saves one anyway, the behaviour this split exists to "
            "end. Everything the user sees is unchanged -- the viewer appears, the chat is "
            "right, the artifact is there -- and the only trace is a row the user never "
            "asked for in their visualization list. Nothing but grading Galaxy for what "
            "should be absent can see it",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find="""    query = {"visualization": name, "dataset_id": a["dataset_id"], **_EMBED}""",
        replace="""    await g.post("api/visualizations",  # FALSIFY: showing saves
                 {"type": name, "title": title, "config": _visualization_config(a)})
    query = {"visualization": name, "dataset_id": a["dataset_id"], **_EMBED}""",
        scenarios=["viz-structure-shown"],
        expect=["visualization.absent"],
    ),
    Break(
        family="visualizationTracks",
        why="a revision drops the tracks it was given, so the second dataset never reaches the "
            "saved config. The agent reports the track added and the pane still renders the "
            "first dataset, so nothing the user or the chat can see distinguishes it from a "
            "visualization that gained a track",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find="""    config = _visualization_config(a)""",
        replace="""    config = _visualization_config(a)
    config.pop("tracks", None)  # FALSIFY: tracks dropped on save""",
        scenarios=["viz-igv-second-track"],
        expect=["visualization.tracksDataset"],
    ),
    Break(
        family="visualizationSettings",
        why="a revision drops the settings it was given, so the genome and the locus never "
            "reach the saved config. The tracks still land and the chat still says the view "
            "moved, which is the point: settings are the half of a visualization that leaves "
            "no trace anywhere else",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find="""    config = _visualization_config(a)""",
        replace="""    config = _visualization_config(a)
    config.pop("settings", None)  # FALSIFY: settings dropped on save""",
        scenarios=["viz-igv-second-track"],
        expect=["visualization.settingsContain"],
    ),
    Break(
        family="visualizationShape",
        why="a conditional's parameters are written beside it instead of inside it. Galaxy "
            "stores that without complaint and the visualization saves, renders and looks "
            "right in the list, but galaxy-charts reads the genome from inside the "
            "conditional and finds nothing, so the view never moves",
        path="brain/olit/drivers/loop/galaxy_tools.py",
        find="""        config["settings"] = a["settings"]""",
        replace="""        config["settings"] = {  # FALSIFY: conditionals flattened
            name: value
            for key, entry in a["settings"].items()
            for name, value in (entry.items() if isinstance(entry, dict) else [(key, entry)])
        }""",
        scenarios=["viz-igv-second-track"],
        expect=["visualization.settingsContain"],
    ),
]

# `session-resumed-after-close`: admitted provisionally, no break discriminates yet.
#
# No break for the workflow-template projection: unit tests pin it instead.
BY_FAMILY = {b.family: b for b in BREAKS}


def run_scenarios(scenarios, model):
    """Run the named scenarios and return {scenario: [assertion, ...]} for what failed."""
    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        report = pathlib.Path(tmp) / "result.json"
        for name in scenarios:
            cmd = [sys.executable, str(ROOT / "evals" / "run.py"), name,
                   "--json", str(report)]
            if model:
                cmd += ["--model", model]
            subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
            if not report.exists():
                out[name] = ["<no result>"]
                continue
            rows = json.loads(report.read_text())
            hit = [r for r in rows if r["scenario"] == name]
            failed = []
            for r in hit:
                failed += [f["assertion"] for f in (r.get("failures") or [])]
                if r.get("error"):
                    failed.append("run.error")
            out[name] = failed
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("families", nargs="*", help="families to falsify (default: all)")
    ap.add_argument("--model", help="substring filter on model id")
    args = ap.parse_args()

    if not os.environ.get("GALAXY_URL", "").strip():
        print("falsification runs the real suite: export GALAXY_URL and GALAXY_API_KEY")
        return 2

    dirty = subprocess.run(["git", "status", "--porcelain", "--", "brain", "evals"],
                           cwd=ROOT, capture_output=True, text=True).stdout.strip()
    if dirty:
        print("working tree has local changes under brain/ or evals/; falsification edits\n"
              "source and restores with `git checkout`, which would discard them:\n" + dirty)
        return 2

    wanted = args.families or list(BY_FAMILY)
    unknown = [f for f in wanted if f not in BY_FAMILY]
    if unknown:
        print(f"unknown families: {', '.join(unknown)}\nknown: {', '.join(BY_FAMILY)}")
        return 2

    verdicts = []
    for family in wanted:
        brk = BY_FAMILY[family]
        print(f"\n=== {family}: {brk.why}")
        brk.apply()
        try:
            results = run_scenarios(brk.scenarios, args.model)
        finally:
            brk.restore()
        for scenario, failed in results.items():
            caught = [a for a in failed if a in brk.expect]
            ok = bool(caught)
            verdicts.append((family, scenario, ok))
            mark = "caught" if ok else "MISSED"
            detail = ", ".join(caught or failed) or "nothing failed"
            print(f"  [{mark:6}] {scenario:36} {detail}")

    missed = [(f, s) for f, s, ok in verdicts if not ok]
    print(f"\n{len(verdicts) - len(missed)}/{len(verdicts)} scenario-break pairs caught")
    for family, scenario in missed:
        print(f"  MISSED {scenario} under {family}: it passes against broken code")
    return 1 if missed else 0


if __name__ == "__main__":
    sys.exit(main())
