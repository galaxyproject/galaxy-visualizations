"""Drive olite's brain headlessly for one scenario."""

import asyncio
import json
import os

from olite import prompt
from olite.drivers import LoopDriver
from olite.registry import ProcessRegistry, SkillRegistry
from olite.runtime import _inject_context
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


class StubGalaxy:
    """A Galaxy that answers plausibly and records what was asked."""

    def __init__(self):
        self.calls = []

    async def get(self, path, binary=False):
        self.calls.append(("GET", path))
        # Real dataset bytes, so the download -> run_python path is exercised end to
        # end rather than only the tool call being emitted.
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
        if "api/pages" in path:
            return []
        # Identity and version answer plausibly too: an agent that gets an empty object
        # back from `get_user` or `get_server_info` concludes Galaxy is unreachable and
        # abandons the task, which reads as a behaviour failure rather than a stub gap.
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
    def __init__(self, messages, logs, tools_called, error=None, status_code=None, events=None):
        self.messages = messages
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


def build_config(model, capabilities=None):
    """Resolve through the brain's provider registry, so evals and the app agree."""
    # A scenario shared with loom carries the surface loom restricts it to; otherwise the
    # full surface this plugin actually ships with.
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
    # A live Galaxy replaces the stub when GALAXY_URL is exported, so a comparison run can
    # put both suites in front of the same server. Unset, the stub answers as before.
    galaxy_root = os.environ.get("GALAXY_URL", "").strip()
    if galaxy_root:
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
    config = build_config(model, scenario.get("capabilities"))
    substrate = Substrate(config)
    # No catalog init: these scenarios exercise the loop, not the graph driver.
    # `galaxy_root` always carries a sentinel, so it cannot decide this; only an explicit
    # GALAXY_URL replaces the stub with a real client.
    if not config.get("live_galaxy"):
        substrate.galaxy = StubGalaxy()

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

    tools_called = []
    messages = transcripts
    logs = []
    events = []
    for turn in scenario["inputs"]:
        messages = [*messages, {"role": "user", "content": turn}]
        events.append("turn_start")
        result = await driver.run(messages, lambda ev: _note(ev, tools_called, events))
        messages = result.get("messages") or messages
        logs.extend(result.get("logs") or [])
        # Only after run() returns: a turn that dies mid-flight must not look complete.
        events.append("turn_end")
    return RunResult(messages, logs, tools_called, events=events)


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
