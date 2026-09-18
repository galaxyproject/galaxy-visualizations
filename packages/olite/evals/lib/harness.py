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

# The eval substrate is a real Galaxy, deliberately.


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
        "capabilities": capabilities.split(","),
    }
    if base:
        config["ai_base_url"] = base.rstrip("/")
    max_steps = os.environ.get("OLITE_EVAL_MAX_STEPS", "").strip()
    if max_steps:
        config["max_steps"] = int(max_steps)
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
    await substrate.catalog.init()

    staged = None
    if scenario.get("dataset"):
        staged = stage_dataset(config, scenario["dataset"])
        if scenario.get("workflows"):
            staged["workflow_ids"] = import_workflows(staged["galaxy"], scenario["workflows"])
    elif scenario.get("workflows"):
        staged = stage_workflows(config, scenario["workflows"])
    elif scenario.get("emptyHistory"):
        staged = stage_empty(config, scenario["emptyHistory"])
    elif scenario.get("toolTest"):
        staged = stage_tool_test(config, scenario["toolTest"])

    processes = ProcessRegistry().load_packaged()
    skills = SkillRegistry().load_packaged()
    driver = LoopDriver(substrate, processes, skills)

    context = "\n\n".join(
        t for t in (prompt.system_text(galaxy_ok=True), skills.router_text()) if t
    )
    transcripts = _inject_context(
        [{"role": "system", "content": scenario.get("systemPrompt", "You are olite.")}], context
    )
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
    # `restartAfter` models closing the browser and coming back with nothing stored.
    restart_after = scenario.get("restartAfter")
    opening = list(messages)
    graded = list(messages)
    for index, turn in enumerate(scenario["inputs"], start=1):
        if restart_after and index == restart_after + 1:
            messages = list(opening)
            events.append("session_restart")
        messages = [*messages, {"role": "user", "content": turn}]
        graded.append({"role": "user", "content": turn})
        events.append("turn_start")
        result = await driver.run(messages, lambda ev: _note(ev, tools_called, events, refused))
        messages = result.get("messages") or messages
        graded.extend(result.get("new_messages") or [])
        logs.extend(result.get("logs") or [])
        artifacts.extend(result.get("artifacts") or [])
        exhausted = exhausted or bool(result.get("exhausted"))
        steps = max(steps, int(result.get("steps") or 0))
        cap = int(result.get("max_steps") or 0) or cap
        # Only after run() returns: a turn that dies mid-flight must not look complete.
        events.append("turn_end")
    return RunResult(graded if restart_after else messages,
                     logs, tools_called, events=events, artifacts=artifacts,
                     exhausted=exhausted, staged=staged, steps=steps, max_steps=cap,
                     refused=refused)


def _note(event, sink, events=None, refused=None):
    kind = event.get("type")
    if events is not None and kind:
        events.append(kind)
    if kind == "tool_start" and event.get("name"):
        sink.append(event["name"])
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

    galaxy.call("api/pages", "POST", {
        "history_id": history_id,
        "title": notebook.title_for_history(history_id),
        "content": notebook.STARTER,
        "content_format": "markdown",
    })


def stage_empty(config, name):
    """An empty history, in the shape the assertions read. For acquisition scenarios."""
    galaxy = tooltests.Galaxy(config["galaxy_root"], config.get("galaxy_key", ""))
    history_id = galaxy.new_history(name or "olite eval")
    _resume_record(galaxy, history_id)
    return {"galaxy": galaxy, "history_id": history_id, "dataset_ids": {},
            "test": None, "tool_id": None}


def _empty_history(config, scenario):
    """A fresh, empty history for scenarios that stage no data."""
    galaxy = tooltests.Galaxy(config["galaxy_root"], config.get("galaxy_key", ""))
    return galaxy.new_history(f"olite eval: {scenario.get('id', 'scenario')}")


def import_workflows(galaxy, spec):
    """The fixture workflows, freshly imported. Returns {filename: workflow_id}."""
    base = pathlib.Path(__file__).resolve().parent.parent / "fixtures" / "workflows"
    definitions = {name: json.loads((base / name).read_text()) for name in spec["files"]}
    wanted = {d["name"] for d in definitions.values()}
    for w in galaxy.call("api/workflows") or []:
        if w.get("name") in wanted:
            galaxy.call(f"api/workflows/{w['id']}", "DELETE")
    return {name: galaxy.call("api/workflows", "POST", {"workflow": d})["id"]
            for name, d in definitions.items()}


def stage_workflows(config, spec):
    """Import fixture workflows, so questions about the instance have a countable answer."""
    galaxy = tooltests.Galaxy(config["galaxy_root"], config.get("galaxy_key", ""))
    ids = import_workflows(galaxy, spec)
    history_id = galaxy.new_history(spec.get("history") or "olite eval")
    _resume_record(galaxy, history_id)
    return {"galaxy": galaxy, "history_id": history_id, "dataset_ids": {},
            "workflow_ids": ids, "test": None, "tool_id": None}


def stage_dataset(config, spec):
    """A history holding one fixture file, as a researcher's would when they sit down."""
    galaxy = tooltests.Galaxy(config["galaxy_root"], config.get("galaxy_key", ""))
    path = pathlib.Path(__file__).resolve().parent.parent / "fixtures" / spec["file"]
    if not path.exists():
        gen = path.with_suffix(path.suffix + ".gen.py")
        if not gen.exists():
            gen = path.parent / (path.stem + ".gen.py")
        namespace: dict = {}
        exec(compile(gen.read_text(), str(gen), "exec"), namespace)
        path.write_text(namespace["build"]())
    history_id = galaxy.new_history(spec.get("history") or "olite eval")
    dataset_id = galaxy.upload(history_id, spec["file"], path.read_bytes())
    state = galaxy.await_dataset(dataset_id).get("state")
    if state != "ok":
        raise tooltests.ToolTestError(f"fixture landed in state {state}")
    _resume_record(galaxy, history_id)
    staged = {"galaxy": galaxy, "history_id": history_id,
              "dataset_ids": {spec["file"]: dataset_id}, "test": None, "tool_id": None}
    if spec.get("thenRuns"):
        staged["produced_dataset_id"] = _stage_run(galaxy, history_id, dataset_id,
                                                   spec["thenRuns"])
    return staged


def _stage_run(galaxy, history_id, dataset_id, spec):
    """Leave a prior job in the history, as a researcher would find after a session.

    Staged rather than requested: asked to do something visibly impossible the agent
    refuses before running, and then nothing exercises how it handles a result that
    already exists. `expectState` is asserted, so a scenario cannot silently test a
    failure that never failed or an empty result that came back full.
    """
    inputs = dict(spec.get("inputs") or {})
    for key, value in list(inputs.items()):
        if value == "$dataset":
            inputs[key] = {"src": "hda", "id": dataset_id}
    submitted = galaxy.call("api/tools", method="POST", body={
        "history_id": history_id, "tool_id": spec["tool_id"], "inputs": inputs})
    outputs = submitted.get("outputs") or []
    if not outputs:
        raise tooltests.ToolTestError(f"{spec['tool_id']} produced no output to fail")
    produced_id = outputs[0]["id"]
    wanted = spec.get("expectState", "error")
    state = galaxy.await_dataset(produced_id).get("state")
    if state != wanted:
        raise tooltests.ToolTestError(
            f"{spec['tool_id']} was expected to land in state {wanted!r} but landed in "
            f"{state!r}; the scenario would not be testing what it claims")
    return produced_id
