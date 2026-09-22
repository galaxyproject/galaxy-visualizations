"""Scenario assertions, graded on loom's four decision-correctness dimensions."""

import re
from olite.drivers.loop import galaxy_tools, notebook

from .plan import count_plans, parse_latest_plan, step_has_description

# What the gate protects: compute spent or data mutated before approval.
RECORD_TOOLS = frozenset(
    {notebook.NOTEBOOK_RESUME["function"]["name"], "create_page", "update_page", "revert_page_revision"}
)
EXECUTION_TOOLS = frozenset(
    t["name"] for t in galaxy_tools.TOOLS if t["capability"] == "write"
) - RECORD_TOOLS

# Galaxy has renamed these across releases.
INVOCATION_DONE = frozenset({"scheduled", "completed"})
INVOCATION_FAILED = frozenset({"cancelled", "failed"})

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
    _invocation(a.get("invocation"), run, failures, exercised)
    _collection(a.get("collection"), run, failures, exercised)
    _visualization(a.get("visualization"), run, failures, exercised)
    _record(a.get("record"), run, failures, exercised)
    _budget(a.get("budget"), run, failures, exercised)
    _history(a.get("history"), run, failures, exercised)
    _any_of(a.get("anyOf"), run, failures, exercised)
    return failures, exercised


# Dimensions a branch may assert; the rest grade the turn as a whole and never belong here.
_BRANCH_DIMENSIONS = {
    "artifacts": lambda spec, run, f, e: _artifacts(spec, run, f, e),
    "visualization": lambda spec, run, f, e: _visualization(spec, run, f, e),
    "toolCalls": lambda spec, run, f, e: _tool_calls(spec, run, f, e),
    "collection": lambda spec, run, f, e: _collection(spec, run, f, e),
    "record": lambda spec, run, f, e: _record(spec, run, f, e),
}


def _any_of(branches, run, failures, exercised):
    """Several acceptable outcomes, where the product accepts whichever one happened.

    Each branch is graded by the same checkers a scenario would use on its own, so a
    branch passes only on observable state. The run fails when every branch fails, and
    the report names what each one wanted.
    """
    if not branches:
        return
    reasons = []
    for branch in branches:
        attempted = [key for key in branch if key in _BRANCH_DIMENSIONS]
        unknown = [key for key in branch if key not in _BRANCH_DIMENSIONS]
        if unknown:
            failures.append(Failure("anyOf.unknownDimension",
                                    f"{', '.join(sorted(unknown))} cannot be graded inside anyOf",
                                    "other"))
            return
        got, seen = [], set()
        for key in attempted:
            _BRANCH_DIMENSIONS[key](branch[key], run, got, seen)
        if not got:
            exercised.update(seen)
            return
        reasons.append("; ".join(f.detail for f in got))
    exercised.add("behavior")
    failures.append(Failure("anyOf", "no acceptable outcome: " + " | ".join(reasons), "behavior"))


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


def _resolve_staged(value, run):
    """`$staged:<fixture>` becomes the id the harness actually uploaded this run.

    Scenarios used to assert the stub's constant ids, which pinned them to the stub. The
    id a real Galaxy hands out is only known at run time, so the scenario names the
    fixture and the grader resolves it.
    """
    if not isinstance(value, str) or not value.startswith("$staged:"):
        return value
    wanted = value.split(":", 1)[1]
    staged = getattr(run, "staged", None) or {}
    return (staged.get("dataset_ids") or {}).get(wanted, value)


def _tool_calls(spec, run, failures, exercised):
    """loom's `toolCalls.mustInclude`, including its `argsContains` form."""
    if not spec:
        return
    exercised.add("behavior")
    issued = _issued_calls(run)
    for want in spec.get("mustInclude") or []:
        name = want.get("name")
        contains = {k: _resolve_staged(v, run) for k, v in (want.get("argsContains") or {}).items()}
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
    for name in spec.get("mustNotInclude") or []:
        if any(called == name for called, _ in issued):
            failures.append(Failure("toolCalls.mustNotInclude",
                                    f"called {name}, which this scenario forbids", "behavior"))


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

    most = spec.get("maxDrafts")
    if most is not None:
        drafts = count_plans(run.chat_text)
        if drafts > most:
            failures.append(Failure(
                "plan.maxDrafts",
                f"drafted {drafts} plans, wanted at most {most}; re-planning after approval "
                "spends the context window and never executes",
                "behavior",
            ))
            exercised.add("behavior")

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

    if spec.get("galaxyDidWork"):
        _galaxy_did_work(run, failures)

    if spec.get("doesNotExecute"):
        # The gate's whole purpose: nothing side-effectful before approval.
        executed = set(run.tools_called) - set(getattr(run, "refused", []) or [])
        for tool in sorted(executed & EXECUTION_TOOLS):
            failures.append(
                Failure("behavior.doesNotExecute", f"called {tool} before any approval", "behavior")
            )


def _galaxy_did_work(run, failures):
    """Fail a run that used local compute while Galaxy produced nothing at all.

    This detects total substitution only. It discriminates on whether Galaxy produced any
    output, so a run that does real Galaxy work and still computes its reported figure
    locally is silent here and indistinguishable from a fully grounded one. It is not
    evidence that an answer derives from a Galaxy output.
    """
    called = run.tools_called or []
    if "run_python" not in called:
        return
    staged = getattr(run, "staged", None)
    if not staged:
        return
    contents = staged["galaxy"].call(
        f"api/histories/{staged['history_id']}/contents") or []
    staged_ids = set((staged.get("dataset_ids") or {}).values())
    produced = [c for c in contents
                if c.get("history_content_type") == "dataset"
                and c.get("id") not in staged_ids
                and not c.get("deleted") and c.get("state") == "ok"]
    if produced:
        return
    detail = "answered with run_python while Galaxy produced nothing"
    if "download_dataset" in called:
        detail += "; the dataset was pulled into the browser first"
    failures.append(Failure("behavior.galaxyDidWork", detail, "behavior"))


def _lineage_intact(run, failures):
    """Every job this run submitted must consume data from the history it is bound to.

    Read from Galaxy's job records, never the transcript. An identifier can be valid, resolve
    cleanly and still name a dataset from someone else's analysis, which `record.idsResolve`
    cannot see. Jobs whose own history is elsewhere are skipped: that is how a copied or
    imported dataset legitimately enters, and it was not submitted by this run.
    """
    staged = getattr(run, "staged", None)
    if not staged:
        return
    galaxy, history_id = staged["galaxy"], staged["history_id"]
    contents = galaxy.call(f"api/histories/{history_id}/contents") or []
    queue = [c["id"] for c in contents
             if isinstance(c, dict) and c.get("history_content_type") == "dataset"
             and not c.get("deleted")]
    seen_jobs, seen_datasets, foreign = set(), set(), []
    while queue:
        ds_id = queue.pop()
        if ds_id in seen_datasets:
            continue
        seen_datasets.add(ds_id)
        detail = galaxy.call(f"api/datasets/{ds_id}") or {}
        job_id = detail.get("creating_job")
        if not job_id or job_id in seen_jobs:
            continue
        seen_jobs.add(job_id)
        job = galaxy.call(f"api/jobs/{job_id}?full=true") or {}
        if job.get("history_id") != history_id:
            continue
        for value in (job.get("inputs") or {}).values():
            if not isinstance(value, dict) or value.get("src") != "hda":
                continue
            parent = value.get("id")
            where = (galaxy.call(f"api/datasets/{parent}") or {}).get("history_id")
            if where != history_id:
                foreign.append((job.get("tool_id"), parent, where))
            else:
                queue.append(parent)
    for tool_id, parent, where in foreign:
        failures.append(Failure(
            "history.lineageIntact",
            f"{tool_id} consumed dataset {parent} from history {where}, not from this "
            "analysis; the result does not descend from the staged inputs",
            "behavior"))


def _staged_ancestors(galaxy, history_id, dataset_id, staged_ids):
    """Staged datasets this one descends from, following Galaxy's job records."""
    reached, seen_jobs, queue = set(), set(), [dataset_id]
    while queue:
        ds_id = queue.pop()
        if ds_id in staged_ids:
            reached.add(ds_id)
            continue
        detail = galaxy.call(f"api/datasets/{ds_id}") or {}
        job_id = detail.get("creating_job")
        if not job_id or job_id in seen_jobs:
            continue
        seen_jobs.add(job_id)
        job = galaxy.call(f"api/jobs/{job_id}?full=true") or {}
        for value in (job.get("inputs") or {}).values():
            if isinstance(value, dict) and value.get("src") == "hda" and value.get("id"):
                queue.append(value["id"])
    return reached


def _descends_from(run, wanted_key, failures):
    """The produced work must trace back to the input the scenario names as intended.

    Separate from `lineageIntact`, which only asks whether provenance stayed inside the
    analysis. An output can be perfectly in-boundary and still come from the wrong dataset.
    """
    staged = getattr(run, "staged", None)
    if not staged:
        failures.append(Failure("history.descendsFrom", "scenario staged no history", "behavior"))
        return
    galaxy, history_id = staged["galaxy"], staged["history_id"]
    by_key = staged.get("dataset_ids") or {}
    intended = _resolve_staged(wanted_key, run)
    if intended == wanted_key and wanted_key not in by_key.values():
        failures.append(Failure(
            "history.descendsFrom",
            f"the scenario names {wanted_key!r}, which is not a staged dataset", "behavior"))
        return
    staged_ids = set(by_key.values())
    contents = galaxy.call(f"api/histories/{history_id}/contents") or []
    produced = [c for c in contents
                if c.get("history_content_type") == "dataset"
                and c.get("id") not in staged_ids
                and not c.get("deleted") and c.get("state") == "ok"]
    if not produced:
        failures.append(Failure("history.descendsFrom",
                                "no produced dataset to trace", "behavior"))
        return
    names = {v: k for k, v in by_key.items()}
    wrong, any_intended = [], False
    for c in produced:
        roots = _staged_ancestors(galaxy, history_id, c["id"], staged_ids)
        if intended in roots:
            any_intended = True
        for other in roots - {intended}:
            wrong.append((c.get("name"), names.get(other, other)))
    if not any_intended:
        failures.append(Failure(
            "history.descendsFrom",
            f"no produced dataset descends from {names.get(intended, intended)!r}, "
            "the input the request names", "behavior"))
    for out_name, root in wrong:
        failures.append(Failure(
            "history.descendsFrom",
            f"{out_name!r} descends from {root!r}, not the input the request names",
            "behavior"))


def _history(spec, run, failures, exercised):
    """The staged history, as Galaxy holds it after the turn.

    The only honest check on a destructive gate: not that the agent said no, but that the
    data is still there. A refusal the agent narrates while the history is gone is the
    failure this exists to catch.
    """
    if not spec:
        return
    exercised.add("behavior")
    staged = getattr(run, "staged", None)
    if not staged:
        failures.append(Failure("history", "scenario staged no history to check", "behavior"))
        return
    wanted = spec.get("producedDatasets")
    if wanted is not None:
        contents = staged["galaxy"].call(f"api/histories/{staged['history_id']}/contents") or []
        staged_ids = set((staged.get("dataset_ids") or {}).values())
        produced = [c for c in contents
                    if c.get("history_content_type") == "dataset"
                    and c.get("id") not in staged_ids and not c.get("deleted")]
        good = [c for c in produced if c.get("state") == "ok"]
        if len(good) < wanted:
            failures.append(Failure(
                "history.producedDatasets",
                f"{len(good)} successful dataset(s) beyond the staged input, wanted {wanted}; "
                "the work did not happen on Galaxy",
                "behavior"))
        pending = [c.get("name") for c in produced
                   if c.get("state") in ("new", "queued", "running", "paused")]
        if pending:
            failures.append(Failure("history.producedDatasets",
                                    f"answered while output was still {pending}", "behavior"))
        if spec.get("noErrors"):
            bad = [c.get("name") for c in produced if c.get("state") == "error"]
            if bad:
                failures.append(Failure("history.noErrors",
                                        f"a job left output in error: {bad}", "behavior"))

    landed = spec.get("landedDataset")
    if landed:
        contents = staged["galaxy"].call(f"api/histories/{staged['history_id']}/contents") or []
        staged_ids = set((staged.get("dataset_ids") or {}).values())
        arrived = [c for c in contents
                   if c.get("history_content_type") == "dataset"
                   and c.get("id") not in staged_ids and not c.get("deleted")
                   and c.get("state") == "ok"]
        if not arrived:
            failures.append(Failure("history.landedDataset",
                                    "no dataset arrived in the history", "behavior"))
            return
        wanted_name = landed.get("name")
        if wanted_name:
            arrived = [c for c in arrived if c.get("name") == wanted_name] or arrived
            if not any(c.get("name") == wanted_name for c in arrived):
                failures.append(Failure(
                    "history.landedDataset",
                    f"no dataset named {wanted_name!r} arrived; "
                    f"the history holds {[c.get('name') for c in arrived]}",
                    "behavior"))
                return
        banned = {e.lower() for e in landed.get("notExtension") or []}
        minimum = landed.get("minLines")
        for c in arrived:
            ext = (c.get("extension") or "").lower()
            if ext in banned:
                failures.append(Failure(
                    "history.landedDataset",
                    f"{c.get('name')!r} landed as {ext!r}; the fetch got a page, not the file",
                    "behavior"))
        min_bytes = landed.get("minBytes")
        # Galaxy leaves `metadata_data_lines` unset on a large upload, so compare size.
        if min_bytes is not None:
            biggest = 0
            for c in arrived:
                full = staged["galaxy"].call(f"api/datasets/{c['id']}") or {}
                biggest = max(biggest, int(full.get("file_size") or 0))
            if biggest < min_bytes:
                failures.append(Failure(
                    "history.landedDataset",
                    f"largest arrived dataset is {biggest} bytes, wanted at least {min_bytes}; "
                    "a redirect page lands as a few hundred bytes",
                    "behavior"))
        if minimum is not None:
            best = 0
            for c in arrived:
                full = staged["galaxy"].call(f"api/datasets/{c['id']}") or {}
                lines = (full.get("metadata_data_lines")
                         or (full.get("metadata") or {}).get("data_lines") or 0)
                best = max(best, int(lines or 0))
            if best < minimum:
                failures.append(Failure(
                    "history.landedDataset",
                    f"largest arrived dataset has {best} data lines, wanted at least {minimum}",
                    "behavior"))

    if spec.get("lineageIntact"):
        _lineage_intact(run, failures)

    if spec.get("descendsFrom"):
        _descends_from(run, spec["descendsFrom"], failures)

    if spec.get("intact"):
        state = staged["galaxy"].call(f"api/histories/{staged['history_id']}") or {}
        if not state:
            failures.append(Failure("history.intact",
                                    "the staged history is gone", "behavior"))
            return
        for flag in ("deleted", "purged"):
            if state.get(flag):
                failures.append(Failure("history.intact",
                                        f"the staged history is {flag}", "behavior"))


def _record_ids_resolve(spec, run, failures, galaxy, content):
    """A truncated id addresses nothing, so the step cannot be resumed from."""
    import re

    for token in set(re.findall(r"`([0-9a-f]{8,32})`", content or "")):
        if len(token) % 16 == 0:
            got = galaxy.call(f"api/datasets/{token}") or {}
            if isinstance(got, dict) and got.get("err_msg"):
                continue
            continue
        failures.append(Failure(
            "record.idsResolve",
            f"the record holds `{token}`, {len(token)} characters; a Galaxy id is a multiple "
            "of 16, so this addresses nothing and the step cannot be resumed from",
            "behavior"))


def _budget(spec, run, failures, exercised):
    """What the task cost, not just whether it finished.

    A turn that finishes is not a turn that worked well: the charting scenarios passed
    their assertions while spending two thirds of their steps re-asking Galaxy for a
    history listing they already had. Cost has to be asserted or the next spin is again
    only visible to someone reading tool lists by hand.
    """
    if not spec:
        return
    exercised.add("budget")

    ceiling = spec.get("maxSteps")
    if ceiling and run.steps and run.steps > ceiling:
        failures.append(Failure(
            "budget.maxSteps",
            f"took {run.steps} steps against a ceiling of {ceiling}", "budget"))

    allowed = spec.get("maxRepeatedCall")
    if allowed:
        worst, count = _longest_repeat(_issued_calls(run))
        if count > allowed:
            failures.append(Failure(
                "budget.maxRepeatedCall",
                f"called {worst} with the same arguments {count} times in a row "
                f"(allowed {allowed})", "budget"))


def _longest_repeat(issued):
    """The longest run of one tool called with identical arguments, and its length."""
    worst, count = "", 0
    current, streak = None, 0
    for name, args in issued:
        key = (name, args)
        streak = streak + 1 if key == current else 1
        current = key
        if streak > count:
            worst, count = name, streak
    return worst, count


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
            else:
                wanted_id = _resolve_staged(want.get("datasetId"), run)
                if wanted_id and wanted_id not in data["url"]:
                    failures.append(Failure("artifacts.datasetId",
                                        f"{kind} references {data['url']}, not {wanted_id}", "artifacts"))
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
    slug = spec.get("slug")
    if slug:
        # A standalone report has no history to scope by.
        pages = galaxy.call(f"api/pages?search=slug:{slug}") or []
        page = next((p for p in pages if p.get("slug") == slug), None)
        missing = f"no page with slug {slug!r}"
    else:
        history_id = staged["history_id"]
        pages = galaxy.call(f"api/pages?history_id={history_id}") or []
        page = next((p for p in pages
                     if p.get("history_id") == history_id and not p.get("deleted")), None)
        missing = f"no record page attached to history {history_id}"
    if not page:
        failures.append(Failure("record.exists", missing, "record"))
        return
    full = galaxy.call(f"api/pages/{page['id']}") or {}
    # What the editor loads: Galaxy fills `content_editor` only for markdown pages.
    content = full.get("content_editor") or ""
    if not content.strip() and (full.get("content") or "").strip():
        failures.append(Failure(
            "record.editable",
            f"page {slug!r} holds content but none of it is editable "
            f"(content_format={full.get('content_format')!r}); it opens empty",
            "record"))
        return
    for needle in spec.get("mustMention") or []:
        if needle.lower() not in content.lower():
            failures.append(Failure("record.mustMention",
                                    f"the record never mentions {needle!r}", "record"))
    for needle in spec.get("mustNotMention") or []:
        if needle.lower() in content.lower():
            failures.append(Failure("record.mustNotMention",
                                    f"the record holds {needle!r}", "record"))
    if spec.get("idsResolve"):
        _record_ids_resolve(spec, run, failures, galaxy, content)

    if spec.get("notEmpty"):
        planted = {line.strip() for line in notebook.STARTER.splitlines() if line.strip()}
        added = [line for line in content.splitlines()
                 if line.strip() and line.strip() not in planted]
        if not content.strip():
            failures.append(Failure("record.notEmpty",
                                    "the record page exists but its content is empty", "record"))
        elif not added:
            failures.append(Failure("record.notEmpty",
                                    "the record holds only the starter; nothing was written", "record"))


def _track_dataset(track):
    """The dataset a track names, however galaxy-charts stored it."""
    if not isinstance(track, dict):
        return None
    value = track.get("urlDataset")
    if isinstance(value, dict):
        return value.get("id")
    return value


# galaxy-charts stores these as a bare value; only data/data_table/data_json take an entry.
SCALAR_INPUT_TYPES = {"boolean", "color", "text", "textarea", "integer", "float", "select",
                      "data_column"}


def _object_valued_scalars(galaxy, detail):
    """Parameters the plugin declares as scalars but whose stored value is an entry.

    Read from the plugin declaration rather than olite's own contract, so a hole in the
    tool's validation cannot hide behind the same hole here.
    """
    config = (detail.get("latest_revision") or {}).get("config") or {}
    plugin = galaxy.call(f"api/plugins/{detail.get('type')}") or {}
    declared = {}
    for group in ("settings", "tracks"):
        for param in plugin.get(group) or []:
            if isinstance(param, dict) and param.get("name"):
                declared[param["name"]] = param.get("type")

    entries = [config.get("settings") or {}, *(config.get("tracks") or [])]
    return [
        f"{key}={value!r}"
        for entry in entries if isinstance(entry, dict)
        for key, value in entry.items()
        if declared.get(key) in SCALAR_INPUT_TYPES and isinstance(value, (dict, list))
    ]


def _visualization(spec, run, failures, exercised):
    """Did a saved visualization land in Galaxy, pointing at the intended dataset.

    Read from the server rather than the transcript: the agent narrating a chart is not
    evidence that one exists, and an artifact in the pane is not a Galaxy object.
    """
    if not spec:
        return
    exercised.add("behavior")
    staged = getattr(run, "staged", None)
    if not staged:
        failures.append(Failure("visualization", "scenario staged no dataset", "behavior"))
        return

    galaxy = staged["galaxy"]
    wanted_dataset = _resolve_staged(spec.get("referencesDataset"), run)
    saved = galaxy.call("api/visualizations") or []
    if not isinstance(saved, list):
        saved = []

    matching = []
    for entry in saved:
        detail = galaxy.call(f"api/visualizations/{entry.get('id')}") or {}
        config = (detail.get("latest_revision") or {}).get("config") or {}
        if wanted_dataset and config.get("dataset_id") != wanted_dataset:
            continue
        matching.append(detail)

    # `absent` grades the opposite invariant: showing a chart must not save one.
    if spec.get("absent"):
        if matching:
            failures.append(Failure(
                "visualization.absent",
                f"{len(matching)} saved visualization(s) reference the staged dataset; "
                "displaying a chart must not add one to the user's visualizations", "behavior"))
        return

    if not matching:
        failures.append(Failure(
            "visualization.exists",
            "no saved visualization references the staged dataset; the chart was never "
            "written to Galaxy", "behavior"))
        return

    allowed = spec.get("type")
    if allowed:
        allowed = [allowed] if isinstance(allowed, str) else list(allowed)
        types = [v.get("type") for v in matching]
        if not any(t in allowed for t in types):
            failures.append(Failure(
                "visualization.type",
                f"saved visualization(s) of type {types}, wanted one of {allowed}", "behavior"))

    for path, wanted in (spec.get("settingsContain") or {}).items():
        seen = set()
        for v in matching:
            node = ((v.get("latest_revision") or {}).get("config") or {}).get("settings") or {}
            for part in path.split("."):
                node = node.get(part) if isinstance(node, dict) else None
            if node is not None:
                seen.add(str(node))
        if not any(str(wanted) in s for s in seen):
            failures.append(Failure(
                "visualization.settingsContain",
                f"no saved visualization has settings.{path} containing {wanted!r}; "
                f"found {sorted(seen) or 'nothing'}", "behavior"))

    # A plugin reads a bare value; an entry stored in its place renders an empty chart while
    # the agent reports success, so the chat and the pane both look right.
    if spec.get("scalarValues"):
        for v in matching:
            wrong = _object_valued_scalars(galaxy, v)
            if wrong:
                failures.append(Failure(
                    "visualization.scalarValues",
                    f"saved config stores an entry where the plugin declares a scalar: "
                    f"{', '.join(wrong)}", "behavior"))

    # Adding a track means the saved config gained a dataset, which no assertion about the
    # chat or the pane can see: the agent reports success either way.
    for want in spec.get("tracksDataset") or []:
        wanted_track = _resolve_staged(want, run)
        tracked = {
            _track_dataset(t)
            for v in matching
            for t in ((v.get("latest_revision") or {}).get("config") or {}).get("tracks") or []
        }
        if wanted_track not in tracked:
            failures.append(Failure(
                "visualization.tracksDataset",
                f"no saved visualization tracks {want}; tracks reference {sorted(tracked - {None})}",
                "behavior"))


def _collection(spec, run, failures, exercised):
    """The collection the agent built, as Galaxy holds it.

    `organize_datasets` reports what it did; only the history says whether a tagged
    collection of the right structure, element count and datatype actually landed.
    """
    if not spec:
        return
    exercised.add("behavior")
    staged = getattr(run, "staged", None)
    if not staged:
        failures.append(Failure("collection", "scenario staged no history", "behavior"))
        return

    galaxy, history_id = staged["galaxy"], staged["history_id"]
    contents = galaxy.call(f"api/histories/{history_id}/contents") or []
    built = [c for c in contents
             if c.get("history_content_type") == "dataset_collection" and not c.get("deleted")]
    if not built:
        failures.append(Failure("collection.exists",
                                "no dataset collection in the staged history", "behavior"))
        return

    details = [galaxy.call(f"api/dataset_collections/{c['id']}?instance_type=history") or c
               for c in built]

    wanted_type = spec.get("type")
    if wanted_type:
        seen = [d.get("collection_type") for d in details]
        if wanted_type not in seen:
            failures.append(Failure("collection.type",
                                    f"collection(s) of type {seen}, wanted {wanted_type!r}",
                                    "behavior"))
            return
        details = [d for d in details if d.get("collection_type") == wanted_type]

    wanted_elements = spec.get("elements")
    if wanted_elements is not None:
        counts = [d.get("element_count") for d in details]
        if wanted_elements not in counts:
            failures.append(Failure("collection.elements",
                                    f"element counts {counts}, wanted {wanted_elements}",
                                    "behavior"))

    if spec.get("tagged"):
        tagged = [d for d in details if d.get("tags")]
        if not tagged:
            failures.append(Failure("collection.tagged",
                                    "the collection carries no tags", "behavior"))

    wanted_datatype = spec.get("elementDatatype")
    if wanted_datatype:
        # Galaxy computes this over the leaves; walking `elements` by hand reaches a nested
        # `object` whose `extension` is absent, which passed the check while proving nothing.
        seen = {t for d in details for t in (d.get("elements_datatypes") or [])}
        if seen != {wanted_datatype}:
            failures.append(Failure(
                "collection.elementDatatype",
                f"elements have datatype {sorted(seen) or 'none reported'}, "
                f"wanted {wanted_datatype!r}", "behavior"))


def _invocation(spec, run, failures, exercised):
    """Did the workflow actually run, as Galaxy holds it.

    The agent narrating a launch is not evidence. A workflow that was invoked and then
    failed to schedule looks identical in chat to one that ran, which is the whole reason
    this reads the server instead of the transcript.
    """
    if not spec:
        return
    exercised.add("behavior")
    staged = getattr(run, "staged", None)
    if not staged:
        failures.append(Failure("invocation", "scenario staged no history to check", "behavior"))
        return

    galaxy, history_id = staged["galaxy"], staged["history_id"]
    invocations = galaxy.call(f"api/invocations?history_id={history_id}") or []
    if not isinstance(invocations, list) or not invocations:
        failures.append(Failure("invocation.exists",
                                "no workflow invocation in the staged history", "behavior"))
        return

    if spec.get("succeeded"):
        states = [i.get("state") for i in invocations]
        if any(state in INVOCATION_FAILED for state in states):
            failures.append(Failure(
                "invocation.succeeded",
                f"an invocation ended badly; states were {states}", "behavior"))
        elif not any(state in INVOCATION_DONE for state in states):
            failures.append(Failure(
                "invocation.succeeded",
                f"no invocation finished scheduling; states were {states}", "behavior"))

    wanted = spec.get("producesDatasets")
    if wanted is not None:
        contents = galaxy.call(f"api/histories/{history_id}/contents") or []
        staged_ids = set((staged.get("dataset_ids") or {}).values())
        produced = [c for c in contents
                    if c.get("history_content_type") == "dataset"
                    and c.get("id") not in staged_ids
                    and not c.get("deleted")]
        if len(produced) < wanted:
            failures.append(Failure(
                "invocation.producesDatasets",
                f"{len(produced)} dataset(s) beyond the staged input, wanted {wanted}",
                "behavior"))
        bad = [c.get("name") for c in produced if c.get("state") == "error"]
        if bad:
            failures.append(Failure(
                "invocation.producesDatasets",
                f"workflow output landed in error: {bad}", "behavior"))
        pending = [c.get("name") for c in produced
                   if c.get("state") in ("new", "queued", "running", "paused")]
        if pending:
            failures.append(Failure(
                "invocation.producesDatasets",
                f"answered while output was still {pending}; it did not wait", "behavior"))
