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

# The eval substrate is a real Galaxy, deliberately. A stub answers Galaxy questions
# with our own beliefs about Galaxy, so anything whose correctness is the server
# contract is invisible to it -- which is how a total failure to save page content
# survived a suite that nominally covered it. Stubs belong in the unit tests.


class RunResult:
    def __init__(self, messages, logs, tools_called, error=None, status_code=None, events=None,
                 artifacts=None, exhausted=False, staged=None, steps=0, max_steps=0,
                 refused=None):
        self.messages = messages
        # Charts and diagrams routed to the shell, never into the model's context.
        self.artifacts = artifacts or []
        # The turn hit MAX_STEPS. The shell says so; grading must not read it as silence.
        self.exhausted = exhausted
        self.steps = steps
        self.max_steps = max_steps
        self.refused = refused or []
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


def build_config(model, capabilities=None):
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
    # A measured run can raise olite's browser-tab backstop to find what a task really
    # costs. pi and loom cap nothing, so a raised cap is also closer to Orbit.
    max_steps = os.environ.get("OLITE_EVAL_MAX_STEPS", "").strip()
    if max_steps:
        config["max_steps"] = int(max_steps)
    # Both suites face one real server. run.py refuses to start without these.
    galaxy_root = os.environ.get("GALAXY_URL", "").strip()
    config["galaxy_root"] = galaxy_root.rstrip("/") + "/"
    config["galaxy_key"] = os.environ.get("GALAXY_API_KEY", "")
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
    # A process reaches Galaxy through the catalog, so the run has to load it or every
    # process call fails with catalog_unavailable.
    await substrate.catalog.init()

    # A tool-test scenario runs against a real Galaxy: the harness puts the test's input
    # files in a history, and the agent is told the goal, not the test's parameters.
    staged = None
    if scenario.get("dataset"):
        staged = stage_dataset(config, scenario["dataset"])
    elif scenario.get("toolTest"):
        staged = stage_tool_test(config, scenario["toolTest"])

    processes = ProcessRegistry().load_packaged()
    skills = SkillRegistry().load_packaged()
    driver = LoopDriver(substrate, processes, skills)

    # Passed explicitly: production derives this from the catalog in runtime.py, and the
    # two assemblies must not drift apart silently.
    context = "\n\n".join(
        t for t in (prompt.system_text(galaxy_ok=True), skills.router_text()) if t
    )
    transcripts = _inject_context(
        [{"role": "system", "content": scenario.get("systemPrompt", "You are olite.")}], context
    )
    # Production binds a history and lists its datasets every turn (runtime.py); without it
    # the agent has to hunt for which history holds a dataset, and sometimes stops to ask.
    # Production binds a real history every turn. A scenario that stages no dataset still
    # needs one, or the agent is bound to nothing and hunts for a history that is not there.
    bound_history = staged["history_id"] if staged else _empty_history(config, scenario)
    transcripts = _inject_record(
        transcripts, await notebook.excerpt(substrate.galaxy, bound_history)
    )

    tools_called = []
    messages = transcripts
    logs = []
    events = []
    refused = []
    artifacts = []
    exhausted = False
    # The most any single turn needed, which is what the cap actually constrains.
    steps = 0
    cap = 0
    for turn in scenario["inputs"]:
        messages = [*messages, {"role": "user", "content": turn}]
        events.append("turn_start")
        result = await driver.run(messages, lambda ev: _note(ev, tools_called, events, refused))
        messages = result.get("messages") or messages
        logs.extend(result.get("logs") or [])
        artifacts.extend(result.get("artifacts") or [])
        exhausted = exhausted or bool(result.get("exhausted"))
        steps = max(steps, int(result.get("steps") or 0))
        cap = int(result.get("max_steps") or 0) or cap
        # Only after run() returns: a turn that dies mid-flight must not look complete.
        events.append("turn_end")
    return RunResult(messages, logs, tools_called, events=events, artifacts=artifacts,
                     exhausted=exhausted, staged=staged, steps=steps, max_steps=cap,
                     refused=refused)


def _note(event, sink, events=None, refused=None):
    kind = event.get("type")
    if events is not None and kind:
        events.append(kind)
    if kind == "tool_start" and event.get("name"):
        sink.append(event["name"])
    # A gated call is announced and then refused. Counting it as "called" would read a
    # working gate as a safety breach, so the refusals are kept apart.
    if kind == "tool_end" and event.get("refused") and refused is not None:
        refused.append(event.get("name"))


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


def _empty_history(config, scenario):
    """A fresh, empty history for scenarios that stage no data."""
    galaxy = tooltests.Galaxy(config["galaxy_root"], config.get("galaxy_key", ""))
    return galaxy.new_history(f"olite eval: {scenario.get('id', 'scenario')}")


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
