"""Scaffold a visualization's `settings` and `tracks` from what the plugin declares.

The visualization counterpart to `tool_inputs.build_input_template`, which galaxy-mcp
gives a Galaxy tool. A tool hands the model a correct-shaped skeleton to fill; a
visualization did not, so the model assembled the config from scratch and stored an
option entry where a bare value belonged. Nesting differs from a tool's flattened
`cond|param` keys: galaxy-charts stores a conditional as an object holding its test
parameter and the chosen case's inputs.

Pure functions of their arguments; the fetching lives in galaxy_tools.py.
"""

import json
import math

# What a value looks like before the model replaces it, by what the type stores.
_SCALAR_PLACEHOLDER = {
    "boolean": False,
    "integer": 0,
    "number": 0.0,
    "string": "<value>",
}


def _declared_values(param, spec):
    """The choices a `declared` options source lists, if this input has any."""
    source = (spec or {}).get("options") or {}
    if source.get("kind") != "declared":
        return []
    field = source.get("from") or ""
    return [v.get("value") for v in (param.get(field) or []) if isinstance(v, dict) and v.get("value") is not None]


def _truthy(value):
    """galaxy-charts `toBoolean`."""
    return str(value).lower() == "true"


def _parse_numeric_literal(value):
    """A declared numeric literal, or nothing: a value that is not one states no default."""
    try:
        parsed = json.loads(str(value))
    except ValueError:
        return None
    if isinstance(parsed, bool) or not isinstance(parsed, (int, float)) or not math.isfinite(parsed):
        return None
    return parsed


def effective_default(param, spec):
    """What an input holds when no config sets it: the declared value, then the type's fallback,
    read through the coercion the type declares. The default-resolution path only."""
    value = param.get("value")
    if value is None:
        fallback = (spec or {}).get("fallback") or {}
        requires = fallback.get("requires")
        if fallback and (not requires or _truthy(param.get(requires))):
            value = fallback.get("value")
    if value is None:
        return None
    coerce = (spec or {}).get("coerce")
    if coerce == "boolean":
        return _truthy(value)
    if coerce == "number":
        return _parse_numeric_literal(value)
    return value


def _placeholder(param, types):
    spec = types.get(param.get("type")) or {}
    stores = spec.get("stores") or {}
    if stores.get("type") == "object":
        # An entry is copied whole from get_visualization_options, never rebuilt from an id.
        return {"<from get_visualization_options>": True}
    default = effective_default(param, spec)
    if default is not None:
        return default
    choices = _declared_values(param, spec)
    if choices:
        return choices[0]
    return _SCALAR_PLACEHOLDER.get(stores.get("type"), "<value>")


def _fill(param, types, out):
    name = param.get("name")
    if not name:
        return
    if param.get("type") != "conditional":
        out[name] = _placeholder(param, types)
        return

    test = param.get("test_param") or {}
    cases = param.get("cases") or []
    # galaxy-charts `formatConditional`: the declared value selects the case, order only without one.
    wanted = case_value(test.get("value"))
    chosen = next((c for c in cases if case_value(c.get("value")) == wanted), None) or (cases[0] if cases else {})
    nested = {}
    if test.get("name"):
        nested[test["name"]] = chosen.get("value", "<choice>")
    for child in chosen.get("inputs") or []:
        _fill(child, types, nested)
    out[name] = nested


def build_visualization_template(plugin, types):
    """A ready-to-fill `settings` object and `tracks` entry for one plugin."""
    settings: dict = {}
    track: dict = {}
    for param in (plugin or {}).get("settings") or []:
        _fill(param, types, settings)
    for param in (plugin or {}).get("tracks") or []:
        _fill(param, types, track)
    out: dict = {"settings": settings}
    if track:
        # One entry; a plugin that takes several tracks takes copies of this shape.
        out["tracks"] = [track]
    return out


GROUPS = ("settings", "tracks")


def _paths_declaring(params, name, path):
    """Canonical paths where `name` is declared, so a refusal can name the address to use."""
    out = []
    for param in params or []:
        if not isinstance(param, dict):
            continue
        own = param.get("name") or "?"
        if param.get("type") == "conditional":
            if (param.get("test_param") or {}).get("name") == name:
                out.append(".".join(path + [own, name]))
            for case in param.get("cases") or []:
                out += _paths_declaring(case.get("inputs"), name, path + [own])
        elif own == name:
            out.append(".".join(path + [own]))
    return out


def declared_paths(plugin, name):
    """Every canonical path under which `plugin` declares `name`, each named once.

    Several cases of one conditional declare the same name at the same path, so a walk over the
    cases finds it repeatedly.
    """
    found = [path for group in GROUPS for path in _paths_declaring((plugin or {}).get(group), name, [group])]
    return list(dict.fromkeys(found))


def _state(config, group):
    """The stored state a group's walk reads its cases from."""
    held = (config or {}).get(group)
    if group == "tracks" and isinstance(held, list):
        # Tracks are copies of one shape, so the first carries the case a lookup needs.
        held = held[0] if held else None
    return held if isinstance(held, dict) else {}


def case_value(value):
    """A case value as the form compares it, where a boolean stringifies to `"true"`."""
    if isinstance(value, bool):
        return "true" if value else "false"
    return None if value is None else str(value)


def named_case(test, value):
    """A case value with the label the form shows for it, where the test parameter declares one."""
    labels = {d.get("value"): d.get("label") for d in (test or {}).get("data") or [] if isinstance(d, dict)}
    label = labels.get(value)
    return f"{value!r} ({label})" if label else repr(value)


def selected_case(test, stated):
    """The case label galaxy-charts compares: `result[testName] ?? test_param.value`."""
    return case_value((test or {}).get("value") if stated is None else stated)


def active_case(param, entry):
    """The case a conditional selects, as `formatConditional` selects it."""
    test = param.get("test_param") or {}
    held = entry.get(param.get("name")) if isinstance(entry, dict) else None
    chosen = selected_case(test, held.get(test.get("name")) if isinstance(held, dict) else None)
    if chosen is None:
        return None
    return next(
        (c for c in param.get("cases") or [] if case_value(c.get("value")) == chosen),
        None,
    )


def _shape(trail, test_name):
    """The config a caller has to send, written the way the template writes an unfilled value."""
    nested = {test_name: "<value>"}
    for step in reversed(trail):
        nested = {step: nested}
    return json.dumps(nested)


def _hit(declared, path):
    """A resolution; the case it sits in is filled in by whichever conditional selected it."""
    return {"declared": declared, "path": path, "case": None, "other_cases": []}


def _resolve(params, segments, state, trail):
    """The input `segments` names under `params`, or a sentence saying why it is not reachable."""
    name, rest = segments[0], segments[1:]
    here = ".".join(trail + [name])
    param = next((p for p in params or [] if isinstance(p, dict) and p.get("name") == name), None)
    if param is None:
        return None, f"{'.'.join(trail)!r} declares nothing named {name!r}."
    if param.get("type") != "conditional":
        if rest:
            return (
                None,
                f"{here!r} is a {param.get('type')!r} input and holds nothing named {rest[0]!r}.",
            )
        return _hit(param, here), None

    test = param.get("test_param") or {}
    cases = param.get("cases") or []
    if not rest:
        return (
            None,
            f"{here!r} is a conditional. Name an input inside it, or its test parameter {test.get('name')!r}.",
        )
    if rest[0] == test.get("name"):
        if len(rest) > 1:
            return (
                None,
                f"{here}.{rest[0]!r} is a test parameter and holds nothing named {rest[1]!r}.",
            )
        return _hit(test, f"{here}.{rest[0]}"), None

    # The config selects one case, exactly as the form does; the others are not in play.
    nested = state.get(name) if isinstance(state, dict) else None
    chosen = selected_case(test, nested.get(test.get("name")) if isinstance(nested, dict) else None)
    active = next(
        (c for c in cases if chosen is not None and case_value(c.get("value")) == chosen),
        None,
    )
    if active is None:
        offered = ", ".join(named_case(test, c.get("value")) for c in cases)
        return None, (
            f"{here!r} selects its inputs by {test.get('name')!r}. Pass "
            f"config={_shape(trail + [name], test.get('name'))} with {test.get('name')!r} as one of {offered}."
        )
    hit, problem = _resolve(active.get("inputs"), rest, nested, trail + [name])
    if hit and hit["case"] is None:
        hit["case"] = active.get("value")
        hit["other_cases"] = [
            c.get("value")
            for c in cases
            if case_value(c.get("value")) != chosen and any(i.get("name") == rest[0] for i in c.get("inputs") or [])
        ]
    return hit, problem


def resolve_parameter(plugin, parameter, config=None):
    """The input a published path names, with `config` selecting each conditional's case.

    Returns `(hit, problem)`. `hit` carries the declaration, its canonical path, the case it sits
    in and that case's siblings; `problem` is a sentence naming what to pass instead.
    """
    segments = [segment for segment in str(parameter or "").split(".") if segment]
    if len(segments) < 2 or segments[0] not in GROUPS:
        return None, (
            f"{parameter!r} is not a parameter path. Name one as get_visualization_details "
            f"publishes it, rooted at {' or '.join(GROUPS)}."
        )
    group = segments[0]
    return _resolve((plugin or {}).get(group), segments[1:], _state(config, group), [group])


def option_bearing(entry, declared, types, path=(), case=None):
    """Every value in a config whose input draws its options from a finite set.

    `case` carries the conditional branch the value sits under, since a branch that offers
    nothing is a different answer from a value that is simply wrong.
    """
    if not isinstance(entry, dict):
        return
    for param in declared or []:
        name = param.get("name") if isinstance(param, dict) else None
        if not name or name not in entry:
            continue
        value = entry[name]
        if param.get("type") == "conditional":
            active = active_case(param, entry)
            if active:
                under = {
                    "test": (param.get("test_param") or {}).get("name"),
                    "value": active.get("value"),
                    "siblings": [c.get("value") for c in param.get("cases") or [] if c is not active],
                }
                yield from option_bearing(value, active.get("inputs"), types, (*path, name), under)
            continue
        spec = types.get(param.get("type")) or {}
        kind = (spec.get("options") or {}).get("kind")
        # `declared` options are the XML's own list; these kinds are resolved by a server.
        if kind and kind != "declared" and value is not None:
            yield ".".join((*path, name)), param, spec, value, case


def is_offered(value, options, param, spec):
    """Whether a value is one the input offers, compared whole, or its effective default.

    A default need not appear among the options: plotly's `y` offers only real columns.
    """
    if any(value == option.get("value") for option in options or []):
        return True
    default = effective_default(param, spec)
    return default is not None and value == default
