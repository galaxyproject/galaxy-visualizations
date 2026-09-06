"""Load loom's scenarios unchanged and adapt them to this harness.

One source of truth prevents test drift; runtime differences are translated explicitly here.
`scenarios/` holds only what cannot cross.
"""

import json
import os

# Excluded, not translated: adapting these would change what they measure.
NOT_PORTABLE = {
    "init-gate-galaxy-no-connection": "asserts no turn starts; this harness always emits turn_start",
}

# pi's lifecycle events mapped to the smaller set this harness emits; unmapped names drop.
EVENT_NAMES = {
    "agent_start": "turn_start",
    "turn_start": "turn_start",
    "turn_end": "turn_end",
}

# galaxy-mcp's `galaxy_`-prefixed names to this suite's. Unlisted names are identical.
TOOL_NAMES = {
    "galaxy_run_tool": "run_tool",
    "galaxy_run_user_tool": "run_user_tool",
    "galaxy_create_user_tool": "create_user_tool",
    "galaxy_delete_user_tool": "delete_user_tool",
    "galaxy_list_user_tools": "list_user_tools",
    "galaxy_search_iwc": "search_iwc_workflows",
    "galaxy_search_tools_by_name": "search_tools_by_name",
    "galaxy_get_workflow_input_template": "get_workflow_input_template",
    "galaxy_invoke_workflow": "invoke_workflow",
    "galaxy_get_user": "get_user",
    "galaxy_upload_file_from_url": "upload_file_from_url",
    "galaxy_pages": "list_pages",
}

# loom also teaches `local` and `hybrid`; this build has no local execution.
ROUTING_TAGS = {"galaxy", "remote"}

# loom's `--tools` mapped to the nearest capability set. `read,write,edit` is pi's file
# tools, so those scenarios get no Galaxy tools -- granting them would let this suite
# consult IWC while loom cannot. No `loomArgs` means the full production surface.
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


def _adapt_tool_calls(spec):
    out = dict(spec)
    wanted = out.get("mustInclude")
    if wanted:
        out["mustInclude"] = [
            {**w, "name": TOOL_NAMES.get(w.get("name"), w.get("name"))} for w in wanted
        ]
    banned = out.get("mustNotInclude")
    if banned:
        out["mustNotInclude"] = [TOOL_NAMES.get(n, n) for n in banned]
    return out


def _adapt_plan(spec):
    out = dict(spec)
    routing = out.get("routingIn")
    if routing and not set(routing) <= ROUTING_TAGS:
        out.pop("routingIn")  # correct answer names a tag this suite lacks; grade the rest
    return out


def _capabilities_for(scenario):
    """Capability string implied by `loomArgs`, or None for the default surface."""
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
    if "toolCalls" in assertions:
        assertions["toolCalls"] = _adapt_tool_calls(assertions["toolCalls"])
    if "plan" in assertions:
        assertions["plan"] = _adapt_plan(assertions["plan"])
    out["assertions"] = assertions
    capabilities = _capabilities_for(scenario)
    if capabilities:
        out["capabilities"] = capabilities
    # loom defaults model scenarios to 3 runs; honour it so both suites use the same n.
    out["runs"] = scenario.get("runs") or (3 if scenario.get("requiresModel") else 1)
    return out


def load(root, only=None):
    """Every portable loom scenario, adapted. Empty when loom is not checked out."""
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
