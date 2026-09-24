"""Scaffold a visualization's `settings` and `tracks` from what the plugin declares.

The visualization counterpart to `tool_inputs.build_input_template`, which galaxy-mcp
gives a Galaxy tool. A tool hands the model a correct-shaped skeleton to fill; a
visualization did not, so the model assembled the config from scratch and stored an
option entry where a bare value belonged. Nesting differs from a tool's flattened
`cond|param` keys: galaxy-charts stores a conditional as an object holding its test
parameter and the chosen case's inputs.

Pure functions of their arguments; the fetching lives in galaxy_tools.py.
"""

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


def _placeholder(param, types):
    spec = types.get(param.get("type")) or {}
    stores = spec.get("stores") or {}
    if stores.get("type") == "object":
        # An entry is copied whole from get_visualization_options, never rebuilt from an id.
        return {"<from get_visualization_options>": True}
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
    first = cases[0] if cases else {}
    nested = {}
    if test.get("name"):
        nested[test["name"]] = first.get("value", "<choice>")
    for child in first.get("inputs") or []:
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


def template_cases(plugin):
    """The other cases each conditional offers, so the first is not the only one seen."""
    out = {}
    for group in ("settings", "tracks"):
        for param in (plugin or {}).get(group) or []:
            if param.get("type") == "conditional":
                values = [c.get("value") for c in param.get("cases") or []]
                if len(values) > 1:
                    out[param["name"]] = values
    return out
