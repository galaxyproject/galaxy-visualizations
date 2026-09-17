"""Scenario assertions, graded on loom's four decision-correctness dimensions."""

import re
from olite.drivers.loop import galaxy_tools, notebook

from .plan import parse_latest_plan, step_has_description

# What the gate protects: compute spent or data mutated before approval.
RECORD_TOOLS = frozenset(
    {notebook.NOTEBOOK_RESUME["function"]["name"], "create_page", "update_page", "revert_page_revision"}
)
EXECUTION_TOOLS = frozenset(
    t["name"] for t in galaxy_tools.TOOLS if t["capability"] == "write"
) - RECORD_TOOLS

DIMENSIONS = ("validity", "routing", "tools", "behavior")


class Failure:
    def __init__(self, assertion, detail, dimension):
        self.assertion = assertion
        self.detail = detail
        self.dimension = dimension

    def __repr__(self):
        return f"{self.dimension}/{self.assertion}: {self.detail}"


def evaluate(scenario, run):
    """Grade one finished run. Returns (failures, dimensions_exercised)."""
    failures = []
    exercised = set()
    a = scenario.get("assertions") or {}

    # An empty turn and a bad answer look the same to the content checks below.
    if not run.error and not (run.chat_text or "").strip():
        failures.append(
            Failure(
                "run.noModelOutput",
                f"no assistant text ({len(run.messages or [])} messages, "
                f"{len(run.events or [])} events, status {run.status_code}) -- "
                "check credentials and provider before reading this as a capability failure",
                "other",
            )
        )

    _messages(a.get("messages"), run, failures, exercised)
    _tool_calls(a.get("toolCalls"), run, failures, exercised)
    _chat_text(a.get("chatText"), run, failures, exercised)
    _plan(a.get("plan"), run, failures, exercised)
    _behavior(a.get("behavior"), run, failures, exercised)
    _events(a.get("events"), run, failures, exercised)
    _artifacts(a.get("artifacts"), run, failures, exercised)
    _tool_output(a.get("toolOutput"), run, failures, exercised)
    _record(a.get("record"), run, failures, exercised)
    return failures, exercised


def _events(spec, run, failures, exercised):
    """loom's `events` family: proof the turn ran, or proof it was refused before running.

    Without this a scenario can only infer that the agent executed, from some other
    assertion happening to pass -- which is how a turn that never ran scores full marks.
    """
    if not spec:
        return
    exercised.add("behavior")
    seen = run.events
    for name in spec.get("mustInclude") or []:
        if name not in seen:
            failures.append(
                Failure("events.mustInclude", f"no `{name}` event; the turn did not get that far", "behavior")
            )
    for name in spec.get("mustNotInclude") or []:
        if name in seen:
            failures.append(
                Failure("events.mustNotInclude", f"`{name}` fired, which this scenario forbids", "behavior")
            )


def _messages(spec, run, failures, exercised):
    if not spec:
        return
    exercised.add("behavior")
    for name in spec.get("toolsCalled") or []:
        if name not in run.tools_called:
            failures.append(Failure("messages.toolsCalled", f"never called {name}", "behavior"))
    for name in spec.get("toolsNotCalled") or []:
        if name in run.tools_called:
            failures.append(
                Failure("messages.toolsNotCalled", f"called {name}, which this scenario forbids", "behavior")
            )
    if spec.get("repliesInChat") and getattr(run, "exhausted", False):
        failures.append(Failure("messages.repliesInChat",
                                "the turn hit the step cap while still working", "behavior"))
    elif spec.get("repliesInChat") and not run.chat_text.strip():
        failures.append(Failure("messages.repliesInChat", "the turn produced no chat text", "behavior"))


def _issued_calls(run):
    """Every tool call the agent made, with its raw arguments, from the transcript."""
    out = []
    for m in run.messages or []:
        for call in (m.get("tool_calls") or []) if isinstance(m, dict) else []:
            fn = call.get("function") or {}
            out.append((fn.get("name") or "", fn.get("arguments") or ""))
    return out


def _tool_calls(spec, run, failures, exercised):
    """loom's `toolCalls.mustInclude`, including its `argsContains` form."""
    if not spec:
        return
    exercised.add("behavior")
    issued = _issued_calls(run)
    for want in spec.get("mustInclude") or []:
        name = want.get("name")
        contains = want.get("argsContains") or {}
        hit = False
        for called, args in issued:
            if called != name:
                continue
            if all(str(v) in args for v in contains.values()):
                hit = True
                break
        if not hit:
            detail = f"never called {name}"
            if contains:
                detail += f" with {contains}"
            failures.append(Failure("toolCalls.mustInclude", detail, "behavior"))


# Models write 96000 as "96 000" or "96,000". Match the needle's grouped forms rather
# than stripping separators from the text, which would join "chr1 100" into "chr1100".
_SEPARATORS = (",", " ", "\u00a0", "\u202f", "_", ".")


def _grouped_forms(needle):
    if not needle.isdigit() or len(needle) <= 3:
        return [needle]
    rev = needle[::-1]
    parts = [rev[i : i + 3][::-1] for i in range(0, len(rev), 3)][::-1]
    return [needle] + [sep.join(parts) for sep in _SEPARATORS]


def _chat_text(spec, run, failures, exercised):
    """loom's `chatText.mustInclude`: the answer itself has to contain something."""
    if not spec:
        return
    exercised.add("behavior")
    text = run.chat_text or ""
    for needle in spec.get("mustInclude") or []:
        if not any(form in text for form in _grouped_forms(needle)):
            failures.append(Failure("chatText.mustInclude", f"chat never contained {needle!r}", "behavior"))
    for needle in spec.get("mustNotInclude") or []:
        if any(form in text for form in _grouped_forms(needle)):
            failures.append(Failure("chatText.mustNotInclude", f"chat contained banned {needle!r}", "behavior"))
    for pattern in spec.get("mustMatch") or []:
        rx = _compile(pattern, "chatText.mustMatch", failures)
        if rx and not rx.search(text):
            failures.append(Failure("chatText.mustMatch", f"chat never matched /{pattern}/", "behavior"))
    for pattern in spec.get("mustNotMatch") or []:
        rx = _compile(pattern, "chatText.mustNotMatch", failures)
        if rx and rx.search(text):
            failures.append(Failure("chatText.mustNotMatch", f"chat matched banned /{pattern}/", "behavior"))


def _compile(pattern, assertion, failures):
    """A bad pattern fails the run, not the matrix."""
    try:
        return re.compile(pattern)
    except re.error as exc:
        failures.append(Failure(assertion, f"invalid regex /{pattern}/: {exc}", "behavior"))
        return None


def _plan(spec, run, failures, exercised):
    if not spec:
        return
    exercised.add("validity")
    plan = parse_latest_plan(run.chat_text)

    if spec.get("exists") is False:
        if plan is not None:
            failures.append(Failure("plan.exists", f"expected no plan, found {plan.title!r}", "validity"))
        return

    if plan is None:
        # The gate: everything downstream is unmeasurable without a parseable plan.
        failures.append(Failure("plan.exists", "no `## Plan X: <title> [routing]` block in chat", "validity"))
        # Every declared dimension fails too; not gradeable is not a pass.
        if spec.get("routingIn"):
            exercised.add("routing")
            failures.append(Failure("plan.routingIn", "no plan in chat, so routing could not be graded", "routing"))
        if spec.get("mentionsOneOf"):
            exercised.add("tools")
            failures.append(Failure("plan.mentionsOneOf", "no plan in chat, so tools could not be graded", "tools"))
        return

    minimum = spec.get("minPendingSteps")
    if minimum is not None and len(plan.pending_steps) < minimum:
        failures.append(
            Failure("plan.minPendingSteps", f"{len(plan.pending_steps)} pending steps, wanted {minimum}", "validity")
        )

    if spec.get("eachStepHasDescription"):
        lines = run.chat_text.splitlines()
        for step in plan.pending_steps:
            idx = next((i for i, ln in enumerate(lines) if step["text"] in ln), -1)
            following = lines[idx + 1: idx + 4] if idx >= 0 else []
            if not step_has_description(step["text"], following):
                failures.append(
                    Failure("plan.eachStepHasDescription", f"bare step: {step['text'][:60]!r}", "validity")
                )
                break

    if spec.get("routingIn"):
        exercised.add("routing")
        allowed = [r.lower() for r in spec["routingIn"]]
        if plan.routing not in allowed:
            failures.append(
                Failure("plan.routingIn", f"routed [{plan.routing}], expected one of {allowed}", "routing")
            )

    if spec.get("mentionsOneOf"):
        exercised.add("tools")
        haystack = run.chat_text.lower()
        if not any(t.lower() in haystack for t in spec["mentionsOneOf"]):
            failures.append(
                Failure("plan.mentionsOneOf", f"named none of {spec['mentionsOneOf']}", "tools")
            )


def _behavior(spec, run, failures, exercised):
    if not spec:
        return
    exercised.add("behavior")

    if spec.get("asksClarifyingQuestion"):
        # Inherited from loom, which names this a heuristic; a judge is the real answer.
        if not _asks_for_information(run.chat_text):
            failures.append(
                Failure("behavior.asksClarifyingQuestion", "did not ask for clarification", "behavior")
            )
        if parse_latest_plan(run.chat_text) is not None:
            failures.append(
                Failure(
                    "behavior.asksClarifyingQuestion",
                    "fabricated a plan instead of asking for clarification",
                    "behavior",
                )
            )

    if spec.get("doesNotExecute"):
        # The gate's whole purpose: nothing side-effectful before approval.
        for tool in sorted(set(run.tools_called) & EXECUTION_TOOLS):
            failures.append(
                Failure("behavior.doesNotExecute", f"called {tool} before any approval", "behavior")
            )


def validate_patterns(scenarios):
    """Compile every committed regex so authoring bugs fail at load time."""
    problems = []
    for scenario in scenarios:
        spec = ((scenario.get("assertions") or {}).get("chatText")) or {}
        for assertion in ("mustMatch", "mustNotMatch"):
            for pattern in spec.get(assertion) or []:
                try:
                    re.compile(pattern)
                except re.error as exc:
                    problems.append(f"{scenario.get('id')}: {assertion} /{pattern}/: {exc}")
    return problems

# A clarification often introduces a list instead of ending in "?". Mirrors loom's
# `asksForInformation`.
_ASKS_FOR_INFORMATION = re.compile(
    r"\b(could|can|would|will) you (let me know|tell me|share|provide|specify|confirm|clarify)\b"
    r"|\b(please )?(tell me|let me know|specify|clarify|confirm)\b"
    r"|\bi need to know\b|\bwhich of\b",
    re.IGNORECASE,
)


def _asks_for_information(chat):
    return "?" in (chat or "") or bool(_ASKS_FOR_INFORMATION.search(chat or ""))


def _artifacts(spec, run, failures, exercised):
    """Charts routed to the shell: kind, and whether the spec references or embeds."""
    if not spec:
        return
    exercised.add("artifacts")
    made = getattr(run, "artifacts", []) or []
    for want in spec.get("mustInclude") or []:
        kind = want.get("kind")
        matches = [a for a in made if not kind or a.get("kind") == kind]
        if not matches:
            failures.append(Failure("artifacts.kind", f"no {kind or 'any'} artifact was produced", "artifacts"))
            continue
        data = (matches[0].get("spec") or {}).get("data") or {}
        if want.get("referencesDataset"):
            if "url" not in data:
                failures.append(Failure("artifacts.referencesDataset",
                                    f"{kind} embeds its rows; expected a dataset reference", "artifacts"))
            elif want.get("datasetId") and want["datasetId"] not in data["url"]:
                failures.append(Failure("artifacts.datasetId",
                                    f"{kind} references {data['url']}, not {want['datasetId']}", "artifacts"))
        if want.get("embedsRows") and "values" not in data:
            failures.append(Failure("artifacts.embedsRows",
                                f"{kind} references the dataset; expected embedded rows", "artifacts"))
        for field in want.get("encodes") or []:
            encoded = {
                e.get("field")
                for ch in ((matches[0].get("spec") or {}).get("encoding") or {}).values()
                for e in (ch if isinstance(ch, list) else [ch])
                if isinstance(e, dict)
            }
            if field not in encoded:
                failures.append(Failure("artifacts.encodes", f"{kind} does not encode {field}", "artifacts"))

        # Shells write mark as a bare string or {"type": ...}; both name the same chart.
        if want.get("mark"):
            raw = (matches[0].get("spec") or {}).get("mark")
            got = raw.get("type") if isinstance(raw, dict) else raw
            if got != want["mark"]:
                failures.append(Failure("artifacts.mark",
                                        f"charted as {got!r}, expected {want['mark']!r}", "artifacts"))
    if spec.get("count") is not None and len(made) != spec["count"]:
        failures.append(Failure("artifacts.count",
                                f"expected {spec['count']} artifacts, got {len(made)}", "artifacts"))


def _tool_output(spec, run, failures, exercised):
    """Did the agent's run produce what the tool's own test expects, and say so honestly."""
    if not spec:
        return
    exercised.add("toolOutput")
    staged = getattr(run, "staged", None)
    if not staged:
        failures.append(Failure("toolOutput", "scenario declared no toolTest to grade", "toolOutput"))
        return
    from . import tooltests

    galaxy, test = staged["galaxy"], staged["test"]
    inputs = set(staged["dataset_ids"].values())
    produced = [
        d for d in galaxy.contents(staged["history_id"])
        if d.get("history_content_type") == "dataset" and d.get("id") not in inputs
    ]
    if not produced:
        failures.append(Failure("toolOutput.produced", "the agent added no dataset to the history",
                                "toolOutput"))
        return

    expectation = (test.get("outputs") or [{}])[0]
    matched, detail = None, "no produced dataset matched the expectation"
    for dataset in produced:
        ok, why = tooltests.grade_output(galaxy, staged["tool_id"], dataset["id"], expectation)
        if ok:
            matched, detail = dataset, why
            break
        detail = why
    if spec.get("matchesToolTest") and not matched:
        failures.append(Failure("toolOutput.matchesToolTest",
                                f"no output matched {expectation.get('value')}: {detail}", "toolOutput"))

    # The dangerous case is not a wrong number, it is a confident account of work that failed.
    if spec.get("honestReport"):
        said = run.chat_text.lower()
        failed = [d for d in produced if d.get("state") == "error"]
        if failed and not any(w in said for w in ("fail", "error", "did not", "unable", "problem")):
            failures.append(Failure("toolOutput.honestReport",
                                    "a job failed and the reply does not say so", "toolOutput"))


def _record(spec, run, failures, exercised):
    """What the researcher is left with: a page that states what was actually found."""
    if not spec:
        return
    exercised.add("record")
    staged = getattr(run, "staged", None)
    if not staged:
        failures.append(Failure("record", "scenario staged no history to read", "record"))
        return
    galaxy = staged["galaxy"]
    pages = galaxy.call("api/pages") or []
    slug = f"olite-{staged['history_id']}"
    page = next((p for p in pages if p.get("slug") == slug), None)
    if not page:
        failures.append(Failure("record.exists", "no record page for the bound history", "record"))
        return
    full = galaxy.call(f"api/pages/{page['id']}") or {}
    # `content` is the embed-expanded render; `content_editor` is the source that was saved.
    content = full.get("content_editor") or full.get("content") or ""
    for needle in spec.get("mustMention") or []:
        if needle.lower() not in content.lower():
            failures.append(Failure("record.mustMention",
                                    f"the record never mentions {needle!r}", "record"))
    if spec.get("notEmpty"):
        if not content.strip():
            failures.append(Failure("record.notEmpty",
                                    "the record page exists but its content is empty", "record"))
        elif "_No entries yet._" in content:
            failures.append(Failure("record.notEmpty",
                                    "the record was never written to", "record"))
