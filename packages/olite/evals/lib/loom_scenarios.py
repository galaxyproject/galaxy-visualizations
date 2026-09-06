"""Load loom's scenarios unchanged and adapt them to this harness.

loom's `evals/scenarios/` is the source of truth for every task both suites run, so
the comparison cannot drift: there is one copy of each scenario and this suite never
edits it. What differs between the runtimes is translated here, in one place, and
each translation is a divergence someone can read and argue with.

`scenarios/` in this directory holds only what genuinely cannot cross.
"""

import json
import os

# Scenarios that drive a mechanism this runtime does not have. Excluded rather than
# translated, because adapting them would change what they measure. Each entry has to
# name the mechanism, so the list stays short and arguable.
NOT_PORTABLE = {
    "init-gate-galaxy-no-connection": (
        "asserts no turn starts at all, which loom's /execute gate can refuse; this "
        "harness synthesises turn_start whenever it runs and has no slash-command gate"
    ),
}

# loom's pi emits its own lifecycle events; this harness synthesises a smaller set
# (see harness.RunResult). Names that carry the same meaning are mapped; anything
# unmapped is dropped rather than silently failing an assertion about an event this
# runtime never emits.
EVENT_NAMES = {
    "agent_start": "turn_start",
    "turn_start": "turn_start",
    "turn_end": "turn_end",
}

# Routing tags this suite teaches. loom teaches `local` and `hybrid` as well, both of
# which mean "run it outside Galaxy" -- the one accepted functional divergence.
ROUTING_TAGS = {"galaxy", "remote"}

# loom restricts the tool surface per scenario with `--tools`. The nearest control here is
# the capability manifest, which gates whole families rather than individual tools.
#
# `read,write,edit` names pi's *file* tools, so loom runs those scenarios with no Galaxy
# tools at all -- its plan scenarios draft blind. Granting `read,write` here would advertise
# all 44 Galaxy tools and let this suite consult the IWC registry while loom cannot, which
# is the difference that made olite collapse two plan steps into one registry workflow and
# fail `minPendingSteps`. Both sides plan from the same information or the score is not a
# comparison.
#
# A scenario that carries no `loomArgs` keeps the full surface this plugin ships with, so
# production-shaped scenarios need no mapping entry.
TOOL_CAPABILITIES = {
    "read,write,edit": "llm,local",
    "skills_fetch": "llm,local",
}


def _adapt_events(spec):
    out = {}
    for key in ("mustInclude", "mustNotInclude"):
        names = spec.get(key)
        if not names:
            continue
        mapped = [EVENT_NAMES[n] for n in names if n in EVENT_NAMES]
        if mapped:
            out[key] = sorted(set(mapped))
    return out


def _adapt_plan(spec):
    out = dict(spec)
    routing = out.get("routingIn")
    if routing and not set(routing) <= ROUTING_TAGS:
        # The scenario's correct answer includes a tag this suite does not teach, so
        # routing is not gradeable here. The rest of the plan still is.
        out.pop("routingIn")
    return out


def _capabilities_for(scenario):
    """The capability string a scenario's `loomArgs` implies, or None to leave the default."""
    args = scenario.get("loomArgs") or []
    if "--no-tools" in args:
        return "llm,local"
    if "--tools" in args:
        requested = args[args.index("--tools") + 1]
        return TOOL_CAPABILITIES.get(requested)
    return None


def adapt(scenario):
    """Translate one loom scenario into the shape this harness grades."""
    out = dict(scenario)
    assertions = dict(out.get("assertions") or {})
    if "events" in assertions:
        events = _adapt_events(assertions["events"])
        if events:
            assertions["events"] = events
        else:
            assertions.pop("events")
    if "plan" in assertions:
        assertions["plan"] = _adapt_plan(assertions["plan"])
    out["assertions"] = assertions
    capabilities = _capabilities_for(scenario)
    if capabilities:
        out["capabilities"] = capabilities
    # loom repeats every model scenario three times by default; honour the scenario's
    # own n so both suites run the same number of times without being told to.
    out["runs"] = scenario.get("runs") or (3 if scenario.get("requiresModel") else 1)
    return out


def load(root, only=None):
    """Every portable loom scenario, adapted.

    Returns [] when loom is not checked out alongside; `NOT_PORTABLE` names what is
    skipped and why.
    """
    if not os.path.isdir(root):
        return []
    out = []
    for entry in sorted(os.listdir(root)):
        path = os.path.join(root, entry, "scenario.json")
        if not os.path.isfile(path):
            continue
        if only and only not in entry:
            continue
        if entry in NOT_PORTABLE:
            continue
        with open(path) as f:
            scenario = adapt(json.load(f))
        scenario["id"] = entry
        scenario["shared"] = True
        out.append(scenario)
    return out
