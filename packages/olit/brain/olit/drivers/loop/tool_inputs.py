"""Scaffold a tool's `inputs` from its io_details schema.

Ported from galaxy-mcp 1.9.0 `galaxy_mcp/tool_inputs.py`. Pure functions of their
arguments; the fetching lives in galaxy_tools.py.
"""

MAX_OPTIONS = 25


def _option_values(p):
    # Galaxy options are [label, value, selected] triples; cap to keep summaries compact.
    options = p.get("options") or []
    return [o[1] if isinstance(o, (list, tuple)) and len(o) > 1 else o
            for o in options[:MAX_OPTIONS]]


def _options_truncated(p):
    return len(p.get("options") or []) > MAX_OPTIONS


def _placeholder(p):
    ptype = p.get("type")
    if ptype == "data":
        return {"src": "hda", "id": "<dataset_id>"}
    if ptype == "data_collection":
        return {"src": "hdca", "id": "<collection_id>"}
    if ptype == "select":
        choices = _option_values(p)
        return choices[0] if choices else "<choice>"
    if ptype == "boolean":
        return False
    if ptype == "integer":
        return 0
    if ptype == "float":
        return 0.0
    return "<value>"


def _fill_param(p, prefix, out):
    name = p.get("name")
    if name is None:
        return
    key = f"{prefix}{name}"
    ptype = p.get("type")
    if ptype == "repeat":
        for child in p.get("inputs", []):
            _fill_param(child, prefix=f"{key}_0|", out=out)
    elif ptype == "section":
        for child in p.get("inputs", []):
            _fill_param(child, prefix=f"{key}|", out=out)
    elif ptype == "conditional":
        tp = p.get("test_param") or {}
        tp_name = tp.get("name")
        cases = p.get("cases", [])
        first = cases[0] if cases else None
        sel_value = first.get("value") if first else "<choice>"
        if tp_name:
            out[f"{key}|{tp_name}"] = sel_value
        if first:
            for child in first.get("inputs", []):
                _fill_param(child, prefix=f"{key}|", out=out)
    else:
        out[key] = _placeholder(p)


def build_input_template(tool_info):
    """A ready-to-fill flattened `inputs` skeleton; repeats show one `name_0|...`."""
    out = {}
    if not isinstance(tool_info, dict):
        return out
    for p in tool_info.get("inputs", []):
        _fill_param(p, prefix="", out=out)
    return out


def _summarize_param(p):
    ptype = p.get("type") or p.get("model_class")
    out = {"name": p.get("name"), "type": ptype}
    if p.get("optional") is not None:
        out["optional"] = p.get("optional")
    if ptype == "repeat":
        out["repeat_key_hint"] = f"{p.get('name')}_0|<param>"
        out["children"] = [_summarize_param(c) for c in p.get("inputs", [])]
    elif ptype == "section":
        out["section_key_hint"] = f"{p.get('name')}|<param>"
        out["children"] = [_summarize_param(c) for c in p.get("inputs", [])]
    elif ptype == "conditional":
        tp = p.get("test_param") or {}
        out["selector"] = {
            "name": tp.get("name"),
            "type": tp.get("type"),
            "choices": _option_values(tp),
            "key_hint": f"{p.get('name')}|{tp.get('name')}",
        }
        if _options_truncated(tp):
            out["selector"]["choices_truncated"] = True
        out["cases"] = [
            {"when": case.get("value"),
             "params": [_summarize_param(c) for c in case.get("inputs", [])]}
            for case in p.get("cases", [])
        ]
    elif ptype == "select":
        out["choices"] = _option_values(p)
        if _options_truncated(p):
            out["choices_truncated"] = True
    return out


def summarize_tool_inputs(tool_info):
    """A model-friendly parameter list that keeps the nesting flattened keys need."""
    if not isinstance(tool_info, dict):
        return []
    return [_summarize_param(p) for p in tool_info.get("inputs", [])]
