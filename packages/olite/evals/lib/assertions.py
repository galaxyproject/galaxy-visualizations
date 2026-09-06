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
    if spec.get("repliesInChat") and not run.chat_text.strip():
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
