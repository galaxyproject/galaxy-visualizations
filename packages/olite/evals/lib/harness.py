"""Drive olite's brain headlessly for one scenario."""

import asyncio
import json
import os
import pathlib

from olite import prompt
from olite.drivers import LoopDriver
from olite.registry import ProcessRegistry, SkillRegistry
from olite.drivers.loop import notebook

from . import tooltests
from olite.runtime import _inject_context, _inject_record
from olite.substrate import Substrate
from olite.substrate.llm import REGISTRY


# A dataset the analysis scenario can actually compute over. Longer than the
# 50-line preview cap on purpose, so a model that sums the preview instead of
# reading the file gets a visibly wrong answer.
_PRICES = [1200] * 50 + [3600] * 10
DATASET_SUM = sum(_PRICES)  # 96000
DATASET_ID = "ds_prices_1"
DATASET_CSV = "Transaction_date,Product,Price,Country\n" + "\n".join(
    f"1/{i % 28 + 1}/09 6:17,Product{i % 3 + 1},{price},United States"
    for i, price in enumerate(_PRICES)
)


HISTORY_ID = "hist1"
VINTENT_DATASET_ID = "ds_health_1"
VINTENT_CSV = (
    pathlib.Path(__file__).resolve().parents[3] / "vintent" / "test-data" / "dataset.csv"
).read_text()


class StubCatalog:
    """Op names -> StubGalaxy, so process scenarios run without an OpenAPI spec."""

    def __init__(self, galaxy):
        self.galaxy = galaxy
        self.calls = []

    def scoped(self, manifest):
        return self

    async def init(self):
        return self

    async def call(self, target, input=None):
        args = dict(input or {})
        self.calls.append((target, args))
        if target == "galaxy.datasets.show.display.get":
            # the graph addresses datasets as history_content_id
            ds = args.get("history_content_id") or args.get("dataset_id")
            return {"ok": True, "result": await self.galaxy.get(f"api/datasets/{ds}/display")}
        if target == "galaxy.histories.show.contents.get":
            return {"ok": True, "result": await self.galaxy.get(
                f"api/histories/{args.get('history_id')}/contents")}
        if target == "galaxy.histories.show.graph.get":
            return {"ok": True, "result": {"nodes": [], "edges": [], "truncated": {}}}
        return {"ok": False, "error": {"code": "unknown_api_op", "message": target}}


class StubGalaxy:
    """A Galaxy that answers plausibly and records what was asked."""

    def __init__(self):
        self.calls = []

    def scoped(self, manifest):
        """Processes narrow the substrate before running; the stub has one view."""
        return self

    async def get(self, path, binary=False):
        self.calls.append(("GET", path))
        # Real dataset bytes, so the download -> run_python path is exercised end to
        # end rather than only the tool call being emitted.
        if path.startswith(f"api/datasets/{VINTENT_DATASET_ID}/display"):
            return VINTENT_CSV.encode("utf-8") if binary else VINTENT_CSV
        if path.startswith(f"api/datasets/{VINTENT_DATASET_ID}"):
            return {"id": VINTENT_DATASET_ID, "name": "health.csv", "extension": "csv",
                    "state": "ok", "file_size": len(VINTENT_CSV)}
        if path.startswith(f"api/datasets/{DATASET_ID}/display"):
            return DATASET_CSV.encode("utf-8") if binary else DATASET_CSV
        if path.startswith(f"api/datasets/{DATASET_ID}"):
            return {"id": DATASET_ID, "name": "prices.csv", "extension": "csv",
                    "state": "ok", "file_size": len(DATASET_CSV)}
        # The dataset has to be discoverable, not just fetchable: a well-behaved agent
        # looks it up in the history before downloading it.
        if "api/histories" in path and "contents" in path:
            return [{"id": DATASET_ID, "hid": 1, "name": "prices.csv", "extension": "csv",
                     "history_content_type": "dataset", "state": "ok", "deleted": False,
                     "visible": True},
                    {"id": VINTENT_DATASET_ID, "hid": 2, "name": "health.csv", "extension": "csv",
                     "history_content_type": "dataset", "state": "ok", "deleted": False,
                     "visible": True}]
        if "api/histories" in path:
            return [{"id": "hist1", "name": "Eval history", "state": "ok"}]
        if path.startswith("api/tools/"):
            # One real-shaped tool, so an execution scenario can verify before running.
            return {
                "id": "addValue", "name": "Add column", "version": "1.0.0",
                "description": "to an existing dataset",
                "inputs": [
                    {"name": "exp", "type": "text", "label": "Add this value", "value": "1"},
                    {"name": "input", "type": "data", "label": "to Dataset", "extensions": ["tabular"]},
                    {"name": "iterate", "type": "select", "label": "Iterate?", "value": "no",
                     "options": [["NO", "no", False], ["YES", "yes", False]]},
                ],
                "outputs": [{"name": "out_file1", "format": "input"}],
            }
        if "api/tools" in path:
            # Only answer for the tool the execution scenario names; a stub that returns the
            # same tool for every query would teach the model the wrong thing.
            q = path.split("q=")[-1].split("&")[0].lower() if "q=" in path else ""
            if "addvalue" in q or "add+column" in q or "add%20column" in q:
                return [{"id": "addValue", "name": "Add column",
                         "description": "to an existing dataset",
                         "panel_section_name": "Text Manipulation"}]
            return []
        if path.startswith("api/pages/"):
            return {"id": "page1", "slug": f"olite-{HISTORY_ID}",
                    "content": "## Record\n\n_No entries yet._\n"}
        if "api/pages" in path:
            return [{"id": "page1", "slug": f"olite-{HISTORY_ID}", "title": "olite record"}]
        # Empty identity reads as "Galaxy unreachable" and the agent abandons the task.
        if path.startswith("api/whoami"):
            return {"id": "user1", "username": "eval", "email": "eval@example.org"}
        if path.startswith("api/version"):
            return {"version_major": "26.2", "version_minor": "dev0"}
        if path.startswith("api/configuration"):
            return {"brand": "Eval Galaxy", "version_major": "26.2", "enable_celery_tasks": True}
        return {}

    async def post(self, path, body=None):
        self.calls.append(("POST", path, body))
        if path.endswith("api/pages"):
            return {"id": "page1", "slug": (body or {}).get("slug"), "title": (body or {}).get("title")}
        return {"id": "obj1", "jobs": [{"id": "job1", "state": "new"}]}

    async def put(self, path, body=None):
        self.calls.append(("PUT", path, body))
        return {"id": "obj1"}

    async def delete(self, path):
        self.calls.append(("DELETE", path))
        return {}


class RunResult:
    def __init__(self, messages, logs, tools_called, error=None, status_code=None, events=None,
                 artifacts=None, exhausted=False, staged=None):
        self.messages = messages
        # Charts and diagrams routed to the shell, never into the model's context.
        self.artifacts = artifacts or []
        # The turn hit MAX_STEPS. The shell says so; grading must not read it as silence.
        self.exhausted = exhausted
        # A tool-test scenario's staged history and the expectation it is graded against.
        self.staged = staged
        self.logs = logs
        self.tools_called = tools_called
        # Every event the brain emitted, plus turn boundaries synthesised by the harness.
        # loom's pi emits agent_start/turn_start/turn_end itself; olite's brain emits a
        # smaller vocabulary, so the runner records the boundaries it already knows about
        # rather than the product growing events to satisfy a test.
        self.events = events or []
        self.error = error
        # The provider's HTTP status, preserved so grading never sniffs the message.
        self.status_code = status_code

    @property
    def chat_text(self):
        """Everything the agent said, in order — what a user would have read."""
        return "\n\n".join(
            m.get("content") or "" for m in self.messages if m.get("role") == "assistant" and m.get("content")
        )


def build_config(model, capabilities=None, substrate=None):
    """Resolve through the brain's provider registry, so evals and the app agree."""
    # Shared scenarios carry loom's restricted surface; others get the full one.
    capabilities = capabilities or os.environ.get("OLITE_EVAL_CAPABILITIES", "llm,local,read,write")
    base = model.get("baseUrl") or ""
    if base.startswith("${") and base.endswith("}"):
        base = os.environ.get(base[2:-1], "")
    config = {
        "galaxy_root": "http://stub.invalid/",
        "ai_provider": model.get("provider"),
        "ai_model": model["model"],
        # Write is granted, or "did not execute" would assert about an unadvertised tool.
        # Trimmable so the tool-surface hypothesis can be tested; loom runs plan
        # scenarios with a smaller surface than olite advertises.
        "capabilities": capabilities.split(","),
    }
    if base:
        config["ai_base_url"] = base.rstrip("/")
    # GALAXY_URL swaps the stub for a real client, so both suites can face one server.
    galaxy_root = os.environ.get("GALAXY_URL", "").strip()
    if galaxy_root and (substrate or os.environ.get("OLITE_EVAL_SUBSTRATE", "live")) != "stub":
        config["galaxy_root"] = galaxy_root.rstrip("/") + "/"
        config["galaxy_key"] = os.environ.get("GALAXY_API_KEY", "")
        config["live_galaxy"] = True
    key = _api_key(model)
    if key:
        config["ai_api_key"] = key
    return config


def _api_key(model):
    """The registry names the env var; envRequires is the fallback for custom entries."""
    provider = REGISTRY.get(model.get("provider"))
    if provider and provider.auth_env:
        return os.environ.get(provider.auth_env, "")
    for name in model.get("envRequires", []):
        if name.endswith("_KEY"):
            return os.environ.get(name, "")
    return ""


async def _run(scenario, model):
    config = build_config(model, scenario.get("capabilities"), scenario.get("substrate"))
    substrate = Substrate(config)
    # `galaxy_root` always holds a sentinel, so only the explicit flag can decide.
    if not config.get("live_galaxy"):
        # Stub scenarios exercise the loop, not the graph driver.
        substrate.galaxy = StubGalaxy()
        substrate.catalog = StubCatalog(substrate.galaxy)
    else:
        # A process reaches Galaxy through the catalog, so a live run has to load it
        # or every process call fails with catalog_unavailable.
        await substrate.catalog.init()

    # A tool-test scenario runs against a real Galaxy: the harness puts the test's input
    # files in a history, and the agent is told the goal, not the test's parameters.
    staged = None
    if scenario.get("dataset"):
        if not config.get("live_galaxy"):
            raise RuntimeError("dataset scenarios need GALAXY_URL; no stub can run a tool")
        staged = stage_dataset(config, scenario["dataset"])
    elif scenario.get("toolTest"):
        if not config.get("live_galaxy"):
            raise RuntimeError("toolTest scenarios need GALAXY_URL; no stub can run a tool")
        staged = stage_tool_test(config, scenario["toolTest"])

    processes = ProcessRegistry().load_packaged()
    skills = SkillRegistry().load_packaged()
    driver = LoopDriver(substrate, processes, skills)

    # StubGalaxy answers tool calls, so Galaxy is available to the agent here even though
    # the catalog is not initialised. Passed explicitly: production derives this from the
    # catalog in runtime.py, and the two assemblies must not drift apart silently.
    context = "\n\n".join(
        t for t in (prompt.system_text(galaxy_ok=True), skills.router_text()) if t
    )
    transcripts = _inject_context(
        [{"role": "system", "content": scenario.get("systemPrompt", "You are olite.")}], context
    )
    # Production binds a history and lists its datasets every turn (runtime.py); without it
    # the agent has to hunt for which history holds a dataset, and sometimes stops to ask.
    bound_history = staged["history_id"] if staged else HISTORY_ID
    transcripts = _inject_record(
        transcripts, await notebook.excerpt(substrate.galaxy, bound_history)
    )

    tools_called = []
    messages = transcripts
    logs = []
    events = []
    artifacts = []
    exhausted = False
    for turn in scenario["inputs"]:
        messages = [*messages, {"role": "user", "content": turn}]
        events.append("turn_start")
        result = await driver.run(messages, lambda ev: _note(ev, tools_called, events))
        messages = result.get("messages") or messages
        logs.extend(result.get("logs") or [])
        artifacts.extend(result.get("artifacts") or [])
        exhausted = exhausted or bool(result.get("exhausted"))
        # Only after run() returns: a turn that dies mid-flight must not look complete.
        events.append("turn_end")
    return RunResult(messages, logs, tools_called, events=events, artifacts=artifacts,
                     exhausted=exhausted, staged=staged)


def _note(event, sink, events=None):
    kind = event.get("type")
    if events is not None and kind:
        events.append(kind)
    if kind == "tool_start" and event.get("name"):
        sink.append(event["name"])


def run_scenario(scenario, model):
    timeout = (scenario.get("timeoutMs") or 150_000) / 1000

    async def guarded():
        return await asyncio.wait_for(_run(scenario, model), timeout=timeout)

    try:
        return asyncio.run(guarded())
    except asyncio.TimeoutError:
        return RunResult([], [], [], error=f"timed out after {timeout:.0f}s")
    except Exception as e:  # a provider error is a run outcome, not a harness crash
        return RunResult(
            [], [], [], error=f"{type(e).__name__}: {e}", status_code=getattr(e, "status_code", None)
        )


def load_scenarios(root, only=None):
    out = []
    for entry in sorted(os.listdir(root)):
        path = os.path.join(root, entry, "scenario.json")
        if not os.path.isfile(path):
            continue
        if only and only not in entry:
            continue
        with open(path) as f:
            data = json.load(f)
        data["id"] = entry
        out.append(data)
    return out


def stage_tool_test(config, spec):
    """A history holding a tool test's inputs, plus the expectation used to grade it."""
    galaxy = tooltests.Galaxy(config["galaxy_root"], config.get("galaxy_key", ""))
    tool_id = spec["tool"]
    index = spec.get("testIndex", 0)
    history_id, ids, test = tooltests.stage(galaxy, tool_id, index)
    _resume_record(galaxy, history_id)
    return {
        "galaxy": galaxy,
        "history_id": history_id,
        "dataset_ids": ids,
        "test": test,
        "tool_id": tool_id,
    }


def _resume_record(galaxy, history_id):
    """Give the staged history its record page.

    `notebook.excerpt` returns nothing without one, so the binding block never reaches
    the agent and it asks which history it is in instead of working.
    """
    from olite.drivers.loop import notebook

    slug = notebook.slug_for_history(history_id)
    galaxy.call("api/pages", "POST", {
        "slug": slug,
        "title": notebook.title_for_history(history_id),
        "content": "## Record\n\n_No entries yet._\n",
        "content_format": "markdown",
    })


def stage_dataset(config, spec):
    """A history holding one fixture file, as a researcher's would when they sit down."""
    galaxy = tooltests.Galaxy(config["galaxy_root"], config.get("galaxy_key", ""))
    path = pathlib.Path(__file__).resolve().parent.parent / "fixtures" / spec["file"]
    history_id = galaxy.new_history(spec.get("history") or "olite eval")
    dataset_id = galaxy.upload(history_id, spec["file"], path.read_bytes())
    state = galaxy.await_dataset(dataset_id).get("state")
    if state != "ok":
        raise tooltests.ToolTestError(f"fixture landed in state {state}")
    _resume_record(galaxy, history_id)
    return {"galaxy": galaxy, "history_id": history_id,
            "dataset_ids": {spec["file"]: dataset_id}, "test": None, "tool_id": None}
