"""The visualization tools: what a plugin declares, what its inputs may hold, and what is saved.

Galaxy declares a plugin's inputs; galaxy-charts owns what each input type stores and where its
options come from. Joining them is this module's job, and the pure declaration traversal lives in
visualization_inputs.py.
"""

import json

import jsonschema

from olit import vendor

from . import vega
from .outcome import ToolOutcome
from .paging import ROW_CAP
from .registry import _STR, _q, _tool
from .visualization_inputs import (
    active_case,
    build_visualization_template,
    declared_paths,
    effective_default,
    is_offered,
    option_bearing,
    resolve_parameter,
)

# Handlers that resolve options, so dispatch hands them the galaxy-charts surface as well.
NEEDS_CHARTS = ("get_visualization_options", "save_visualization", "vega_dataset")


async def a_visualization_named(g, query):
    """The installed visualization this query names, if the tool catalog is the wrong one."""
    wanted = (query or "").strip().lower()
    installed = await g.get("api/plugins") or []
    names = [p.get("name") for p in installed if p.get("name") not in NOT_OFFERED]
    return next((n for n in names if n and n.lower() == wanted), None)


# This agent, and a standalone plugin that defers its chart to its own LLM at view time.
# Both would answer "what can render this" with themselves.
NOT_OFFERED = {"olit", "vintent"}

NUMERIC_COLUMNS = frozenset({"int", "float"})


MATCH_CAP = 5


def _column_parameters(plugin):
    return [
        parameter.get("name")
        for parameter in (plugin.get("tracks") or []) + (plugin.get("settings") or [])
        if parameter.get("type") == "data_column"
    ]


def _describe_plugin(plugin, preferred):
    columns = _column_parameters(plugin)
    described = {
        "name": plugin.get("name"),
        "description": plugin.get("description"),
        "tags": plugin.get("tags") or [],
        "parameters": len(plugin.get("settings") or []) + len(plugin.get("tracks") or []),
    }
    if plugin.get("name") in preferred:
        described["preferred_for_datatype"] = True
    if columns:
        described["column_parameters"] = columns
    return described


async def _preferred_visualizations(g, extension):
    if not extension:
        return set()
    mappings = await g.get(f"api/datatypes/{extension}/visualizations") or []
    return {m.get("visualization") for m in mappings if isinstance(m, dict)}


async def _list_visualizations(g, a):
    dataset = await g.get(f"api/datasets/{a['dataset_id']}") or {}
    extension = dataset.get("extension")
    column_types = dataset.get("metadata_column_types") or []
    numeric = [t for t in column_types if t in NUMERIC_COLUMNS]

    matching = await g.get(f"api/plugins{_q({'dataset_id': a['dataset_id']})}") or []
    matching = [p for p in matching if p.get("name") not in NOT_OFFERED]
    preferred = await _preferred_visualizations(g, extension)
    matching.sort(key=lambda p: p.get("name") not in preferred)

    # Answers only "what can render this". The dataset's columns belong to get_dataset_details,
    # so a column lookup does not double as a plugin advertisement.
    result = {
        "dataset_id": a["dataset_id"],
        "extension": extension,
        "visualizations": [_describe_plugin(p, preferred) for p in matching],
    }
    if not matching:
        result["hint"] = (
            f"No installed visualization accepts the datatype {extension!r}. "
            "Converting the dataset to a supported datatype is the usual route."
        )
    elif any(_column_parameters(p) for p in matching) and not numeric:
        result["hint"] = (
            "Galaxy detected no numeric columns in this dataset, so visualizations that bind a "
            "column cannot be filled. Either re-detect the dataset's metadata so the columns are "
            "recognised, or use vega_dataset, which reads the columns by position."
        )
    return result


_EMBED = {"hide_panels": "true", "hide_masthead": "true"}


async def _resolve_visualization(g, a):
    """The plugin and dataset, or a refusal naming what the server will actually render."""
    name, dataset_id = a["visualization"], a["dataset_id"]
    installed = await g.get("api/plugins") or []
    if not any(p.get("name") == name for p in installed):
        return None, {
            "error": f"Refused: {name!r} is not an installed visualization.",
            "hint": "Call list_visualizations for the dataset to see what this server offers.",
        }

    dataset = await g.get(f"api/datasets/{dataset_id}") or {}
    compatible = await g.get(f"api/plugins{_q({'dataset_id': dataset_id})}") or []
    if not any(p.get("name") == name for p in compatible):
        return None, {
            "error": f"Refused: {name!r} cannot render the datatype " f"{dataset.get('extension')!r}.",
            "can_render_it": sorted(p.get("name") for p in compatible),
            "hint": "Call list_visualizations for this dataset for the full picture.",
        }
    return dataset, None


def _visualization_config(a):
    config = {"dataset_id": a["dataset_id"]}
    if a.get("settings"):
        config["settings"] = a["settings"]
    if a.get("tracks"):
        config["tracks"] = a["tracks"]
    return config


def _describe_parameter(param, types, path=()):
    """One declared input, joined with what galaxy-charts stores for its type."""
    kind = param.get("type")
    spec = types.get(kind) or {}
    described = {"name": param.get("name"), "type": kind}
    if path:
        # The address get_visualization_options takes, so it is copied rather than inferred.
        described["path"] = ".".join(list(path) + [param.get("name") or "?"])
    for key in ("label", "help"):
        if param.get(key):
            described[key] = param[key]
    default = effective_default(param, spec)
    if default is not None:
        described["default"] = default
    if spec.get("stores"):
        described["stores"] = spec["stores"]
    for bound in spec.get("bounds") or []:
        if param.get(bound) is not None:
            described[bound] = param[bound]

    source = spec.get("options")
    if source:
        options = {"kind": source["kind"]}
        declared = param.get(source.get("from") or "")
        if declared:
            options["values" if source["kind"] == "declared" else source["from"]] = declared
        for f in source.get("filters") or []:
            if param.get(f) is not None:
                options[f] = param[f]
        if source["kind"] != "declared":
            # A declared source carries its values; every other kind holds them on the server.
            options["resolve"] = "get_visualization_options"
            # An option's `value` is what the form assigns; its id only identifies the option.
            options["pass_through"] = "the resolved option's `value`, unchanged"
        described["options"] = options

    test = param.get("test_param")
    if test:
        inside = list(path) + [param.get("name") or "?"] if path else ()
        described["chosen_by"] = _describe_parameter(test, types, inside)
        described["cases"] = [
            {
                "when": c.get("value"),
                "inputs": [_describe_parameter(i, types, inside) for i in (c.get("inputs") or [])],
            }
            for c in (param.get("cases") or [])
        ]
    return described


async def _get_visualization_details(g, a):
    """One plugin's parameters, fetched per plugin so a listing stays cheap.

    Galaxy declares which inputs a plugin has; galaxy-charts owns what each input type
    stores. Joining them here states the shape and the legal values instead of leaving the
    agent to infer them from parameter names.
    """
    name = a["visualization"]
    plugin = await g.get(f"api/plugins/{name}") or {}
    if not plugin.get("name"):
        return ToolOutcome(
            f"Refused: {name!r} is not an installed visualization. Call list_visualizations "
            f"for a dataset to see what this server offers.",
            is_error=True,
        )

    types = (vendor.galaxy_charts_inputs() or {}).get("types") or {}
    template = build_visualization_template(plugin, types)
    return {
        "name": plugin.get("name"),
        "description": plugin.get("description"),
        # The shape to fill, as get_tool_input_template gives one for a Galaxy tool.
        "config_template": template,
        "settings": [_describe_parameter(p, types, ("settings",)) for p in (plugin.get("settings") or [])],
        "tracks": [_describe_parameter(p, types, ("tracks",)) for p in (plugin.get("tracks") or [])],
        "hint": "`stores` is the schema a value is validated against; for an input naming "
        "`pass_through`, resolve its options and send the chosen option's `value` rather than "
        "building one to that schema. Build `settings` and `tracks` and pass them to "
        "save_visualization: settings cannot ride in a displayed visualization, only in a saved one.",
    }


def _identity(value):
    """What names an option: an object's id, or the value itself when it is a scalar."""
    return value.get("id") if isinstance(value, dict) else value


def _match(entry, search):
    if not search:
        return False
    hay = " ".join(str(entry.get(k) or "") for k in ("id", "name", "label", "value")).lower()
    return search.lower() in hay


async def get_visualization_options(g, charts, a):
    """What a parameter's options actually are, resolved from where the plugin says they live.

    The declaration says a genome comes from a remote list or a data table; it does not say
    what is in one. Without this the agent invents an option, and for a parameter whose value
    is an object copied verbatim it cannot invent a usable one.
    """
    name, asked = a["visualization"], a["parameter"]
    plugin = await g.get(f"api/plugins/{name}") or {}
    if not isinstance(plugin, dict) or not plugin.get("name"):
        return ToolOutcome(f"Refused: {name!r} is not an installed visualization.", is_error=True)

    resolved, problem = resolve_parameter(plugin, asked, a.get("config"))
    if problem:
        leaf = str(asked).rsplit(".", 1)[-1]
        elsewhere = [path for path in declared_paths(plugin, leaf) if path != asked]
        where = f" {leaf!r} is declared at {', '.join(elsewhere)}." if elsewhere else ""
        return ToolOutcome(f"Refused: {problem}{where}", is_error=True)
    declared, wanted = resolved["declared"], resolved["path"]
    declared_cases, when = resolved["other_cases"], resolved["case"]

    types = (vendor.galaxy_charts_inputs() or {}).get("types") or {}
    kind = (((types.get(declared.get("type")) or {}).get("options")) or {}).get("kind")
    search = a.get("search")

    envelope = await charts.get_options(declared, {"datasetId": a.get("dataset_id")})
    if not envelope.get("success"):
        return ToolOutcome(
            f"Could not resolve {wanted!r}: {envelope.get('message') or 'the lookup failed'}.",
            is_error=True,
        )
    offered = envelope.get("data") or []
    if not kind:
        return {
            "parameter": wanted,
            "source": declared.get("type"),
            "hint": "This parameter's options are not a list to browse; "
            "get_visualization_details says what it accepts.",
        }
    # galaxy-charts answers `{label, value}`; what the model stores is the value, whole.
    entries = [
        {
            "id": _identity(o.get("value")),
            "name": o.get("label"),
            "value": o.get("value"),
        }
        for o in offered
    ]

    # Each option carries the value to store: matching a label and filling the field is one call,
    # and an id is not a value for an input whose options are objects.
    result = {
        "parameter": wanted,
        "source": kind,
        "total": len(entries),
        "options": entries[:ROW_CAP],
    }
    # A case can be declared and still hold nothing on this server: IGV's builtin genomes
    # are a data table an admin may never have filled. Naming its siblings is the difference
    # between a dead end and a second try.
    siblings = declared_cases
    if not entries and siblings:
        result["other_cases"] = siblings
        result["hint"] = (
            f"This server lists no {wanted!r} for {when!r}. The same parameter is "
            f"declared for {', '.join(repr(c) for c in siblings)}; try one of those."
        )
        return result
    if search:
        result["matches"] = [e for e in entries if _match(e, search)][:MATCH_CAP]
        result["hint"] = (
            "`matches` holds the values to store as given; pass one through " "unchanged rather than rebuilding it."
        )
    else:
        result["hint"] = (
            "Store an option's `value` as given rather than rebuilding it from its id; " "`search` narrows a long list."
        )
    return result


async def _get_visualization(g, a):
    """A saved visualization's current config, to change rather than overwrite.

    save_visualization replaces the config wholesale, so adding a track means reading what
    is there first: rebuilding it blind drops whatever the plugin itself put there.
    """
    saved = await g.get(f"api/visualizations/{a['visualization_id']}") or {}
    if not saved.get("id"):
        return ToolOutcome(
            f"No saved visualization {a['visualization_id']!r}. Pass the visualization_id "
            f"that save_visualization returned.",
            is_error=True,
        )
    config = (saved.get("latest_revision") or {}).get("config") or {}
    return {
        "visualization_id": saved.get("id"),
        "visualization": saved.get("type"),
        "title": saved.get("title"),
        "dataset_id": config.get("dataset_id"),
        "settings": config.get("settings") or {},
        "tracks": config.get("tracks") or [],
        "hint": "Change what needs changing and pass it all back to save_visualization with this "
        "visualization_id. Anything left out is dropped, so send the settings and tracks "
        "you want to keep, not only the new ones.",
    }


async def _show_visualization(g, a):
    dataset, refusal = await _resolve_visualization(g, a)
    if refusal:
        return {"shown": False, **refusal}

    name = a["visualization"]
    title = a.get("title") or f"{name} of {dataset.get('name') or a['dataset_id']}"
    query = {"visualization": name, "dataset_id": a["dataset_id"], **_EMBED}
    return {
        "shown": True,
        "title": title,
        "artifact": {
            "kind": "visualization",
            "title": title,
            "visualization": name,
            "dataset_id": a["dataset_id"],
            "url": f"/visualizations/display{_q(query)}",
        },
        "hint": "The visualization is displayed to the user. Nothing was added to Galaxy, so "
        "call save_visualization if they ask to keep it. Writing it into the record "
        "means putting {{artifact}} where it belongs in the page content. Say what it "
        "shows and finish.",
    }


def _level_names(declared):
    """Names valid at this level. A conditional contributes its own name, not its inputs."""
    return {p["name"] for p in declared or [] if isinstance(p, dict) and p.get("name")}


def _check_level(entry, declared, types, where):
    """Validate one object against the inputs declared for it.

    Mirrors galaxy-charts `parseValues`: a conditional's value is an object holding its test
    parameter and the inputs of the matching case. Flattening those to the parent is a shape
    the form never writes, and Galaxy stores it without complaint.
    """
    allowed = _level_names(declared)
    if not allowed:
        return None
    if not isinstance(entry, dict):
        return {
            "error": f"Refused: {where} is an object keyed by parameter name; " f"got {type(entry).__name__}.",
            "declared": sorted(allowed),
        }

    unknown = sorted(set(entry) - allowed)
    if unknown:
        return {
            "error": f"Refused: {where} declares no parameter {unknown[0]!r}.",
            "declared": sorted(allowed),
            "hint": "Parameters inside a conditional belong in that conditional's object, "
            "not beside it. get_visualization_details shows the nesting.",
        }

    for param in declared or []:
        if not isinstance(param, dict) or param.get("name") not in entry:
            continue
        value = entry[param["name"]]
        if param.get("type") == "conditional":
            test = (param.get("test_param") or {}).get("name")
            cases = param.get("cases") or []
            active = active_case(param, entry)
            if active is None:
                labels = ", ".join(repr(c.get("value")) for c in cases)
                return {
                    "error": f"Refused: {param['name']}.{test} selects the case, so it takes one of {labels}.",
                    "declared": sorted(allowed),
                }
            # A test parameter holds a case label, not a value of its own declared type.
            nested = _check_level(
                value,
                [{"name": test}] + list(active.get("inputs") or []),
                types,
                param["name"],
            )
            if nested:
                return nested
            continue
        bad = _wrong_shape(param["name"], value, (types.get(param.get("type")) or {}).get("stores"))
        if bad:
            return bad
    return None


def _wrong_shape(name, value, spec):
    """The value against the schema galaxy-charts publishes for the input's type.

    Checked both ways: an id where the entry belongs, and an entry where the value does.
    Galaxy type-checks neither, so the plugin is left reading a shape it cannot use.
    """
    if not spec or value is None:
        return None
    try:
        jsonschema.validate(value, spec)
        return None
    except jsonschema.ValidationError as exc:
        wanted = spec.get("type")
        if wanted == "object":
            error = f"Refused: {name!r} takes the whole entry it was chosen from, not {value!r}."
        elif isinstance(value, (dict, list)):
            error = f"Refused: {name!r} stores {wanted}, not the entry it was chosen from."
        else:
            error = f"Refused: {name!r} stores {wanted}: {exc.message}"
    return {
        "error": error,
        "expected": spec,
        "hint": "Call get_visualization_options with `search`: it returns the value to store, "
        "whole for an input that takes an entry and bare for one that takes a string.",
    }


def _reject_undeclared(plugin, a):
    """Refuse a config the plugin would not produce, naming what it declares.

    The shape is published by get_visualization_details, and an agent that writes without
    asking invents one: a key the plugin has no input for, a conditional's parameters
    flattened beside it, or an id where an entry belongs. Galaxy stores all of them and the
    plugin reads none, so a silent accept renders without the thing that was asked for.
    """
    if not isinstance(plugin, dict):
        return None
    types = (vendor.galaxy_charts_inputs() or {}).get("types") or {}

    if a.get("settings") is not None and not isinstance(a["settings"], dict):
        return {
            "saved": False,
            "error": "Refused: settings is one object keyed by parameter name.",
            "hint": 'Send {"locus": "chr1:1-100"}, not a list.',
        }
    if a.get("tracks") is not None and not isinstance(a["tracks"], list):
        return {
            "saved": False,
            "error": "Refused: tracks is a list, one object per track.",
            "hint": "Send [{...}], one entry for each track.",
        }

    if a.get("settings") is not None:
        bad = _check_level(a["settings"], plugin.get("settings"), types, "settings")
        if bad:
            return {"saved": False, **bad}
    for track in a.get("tracks") or []:
        bad = _check_level(track, plugin.get("tracks"), types, "a track")
        if bad:
            return {"saved": False, **bad}
    return None


async def _reject_unoffered(charts, plugin, a, types):
    """Refuse a value the server does not offer, resolving the options again at the write.

    A lookup that could not be made never blocks a save; one that succeeded and offers
    nothing does, because then no value is valid.
    """
    levels = [(a.get("settings"), plugin.get("settings"))]
    levels += [(track, plugin.get("tracks")) for track in a.get("tracks") or []]
    for entry, declared in levels:
        for path, param, spec, value, case in option_bearing(entry, declared, types):
            envelope = await charts.get_options(param, {"datasetId": a.get("dataset_id")})
            if not envelope.get("success"):
                continue
            offered = envelope.get("data") or []
            if is_offered(value, offered, param, spec):
                continue
            if not offered and case:
                return {
                    "saved": False,
                    "error": f"Refused: this server lists no {path} for {case['test']}={case['value']!r}.",
                    "other_cases": case["siblings"],
                    "hint": (
                        "The same parameter is declared for "
                        + ", ".join(repr(s) for s in case["siblings"])
                        + "; a value resolved under one of those does not become valid by "
                        f"leaving {case['test']} as {case['value']!r}."
                    ),
                }
            names = ", ".join(repr(_identity(o.get("value"))) for o in offered[:MATCH_CAP])
            return {
                "saved": False,
                "error": f"Refused: {path} does not exactly match a value this server offers.",
                "hint": (
                    f"{len(offered)} value(s) are offered"
                    + (f", including {names}" if names else " for this case")
                    + ". These were resolved with "
                    + (f"dataset_id={a['dataset_id']!r}" if a.get("dataset_id") else "no dataset")
                    + "; call get_visualization_options the same way and store the option's "
                    "complete `value` unchanged, since a value naming the right entry with "
                    "different or fewer fields is not it."
                ),
            }
    return None


async def _save_visualization(g, charts, a):
    dataset, refusal = await _resolve_visualization(g, a)
    if refusal:
        return {"saved": False, **refusal}

    if a.get("settings") or a.get("tracks"):
        plugin = await g.get(f"api/plugins/{a['visualization']}") or {}
        undeclared = _reject_undeclared(plugin, a)
        if undeclared:
            return ToolOutcome(undeclared, is_error=True)
        types = (vendor.galaxy_charts_inputs() or {}).get("types") or {}
        unoffered = await _reject_unoffered(charts, plugin, a, types)
        if unoffered:
            return ToolOutcome(unoffered, is_error=True)

    name = a["visualization"]
    title = a.get("title") or f"{name} of {dataset.get('name') or a['dataset_id']}"
    config = _visualization_config(a)

    # Revising one visualization rather than adding another: Galaxy keeps the revisions, and
    # the user's list does not grow every time the settings change.
    visualization_id = a.get("visualization_id")
    if visualization_id:
        # Galaxy answers with the new revision, or with nothing when the config is unchanged.
        await g.put(f"api/visualizations/{visualization_id}", {"title": title, "config": config})
    else:
        created = await g.post("api/visualizations", {"type": name, "title": title, "config": config})
        visualization_id = (created or {}).get("id")
        if not visualization_id:
            return ToolOutcome(
                "Galaxy accepted the visualization but returned no id, so there is nothing "
                f"to display or revise. It answered: {json.dumps(created, default=str)}",
                is_error=True,
            )
    # Galaxy reads the plugin name from the query, never from the saved object.
    query = {"visualization": name, "visualization_id": visualization_id, **_EMBED}
    artifact = {
        "kind": "visualization",
        "title": title,
        "visualization": name,
        "dataset_id": a["dataset_id"],
        "url": f"/visualizations/display{_q(query)}",
    }
    artifact.update({k: a[k] for k in ("settings", "tracks") if a.get(k)})
    return {
        "saved": True,
        "visualization_id": visualization_id,
        "title": title,
        "artifact": artifact,
        "hint": "Saved to the user's visualizations and displayed. It is not a history dataset. "
        "Writing it into the record means putting {{artifact}} where it belongs in the "
        "page content; visualization_id above identifies the saved object and renders "
        "nothing in a page. Say what it shows and finish.",
    }


async def _vega_dataset(g, charts, a):
    """A Vega-Lite chart of one dataset, rendered inline and placeable in the record."""
    dataset_id = a.get("dataset_id")
    if not dataset_id:
        return {"charted": False, "error": "dataset_id is required."}
    details = await g.get(f"api/datasets/{dataset_id}") or {}
    if not details.get("id"):
        return {"charted": False, "error": f"No dataset {dataset_id!r} is readable."}
    ready, refusal = vega.build(dataset_id, a.get("spec"), details)
    if refusal:
        return {"charted": False, "error": f"Refused: {refusal}"}
    # A page renders whatever it is given, so a spec that does not compile has to stop here.
    verdict = await charts.compile_spec(ready)
    if not verdict.get("success"):
        return {
            "charted": False,
            "error": f"Refused: the spec could not be compile-checked: {verdict.get('message')}",
        }
    problems = (verdict.get("data") or {}).get("problems") or []
    if problems:
        return {
            "charted": False,
            "error": "Refused: vega-lite rejects this spec: " + "; ".join(problems[:3]),
        }
    title = a.get("title") or details.get("name") or "Chart"
    result = {
        "charted": True,
        "title": title,
        "columns": vega.column_names(details),
        "artifact": {"kind": "vega-lite", "title": title, "spec": ready},
    }
    suspect = vega.unsatisfiable_types(ready, details)
    if suspect:
        result["note"] = (
            f"Galaxy types {', '.join(repr(f) for f in suspect)} as text, so a quantitative "
            "encoding on it plots only the rows that parse as numbers, and none if it holds no "
            "numbers at all. Check the chart says what you meant."
        )
    return result


def register():
    """Declare these tools into the registry, in the order the catalogue lists them."""
    _tool(
        "get_visualization_options",
        "read",
        "Resolve a visualization parameter's selectable options from wherever the plugin says "
        "they live. `parameter` is the `path` get_visualization_details publishes. Where a name is "
        "declared in several cases of a conditional, pass `config` in the shape save_visualization "
        "takes, so the test parameter in it says which case. Use `search` to get the value to store.",
        {
            "visualization": _STR,
            "parameter": _STR,
            "search": _STR,
            "config": {"type": "object"},
            "dataset_id": _STR,
        },
        ["visualization", "parameter"],
        get_visualization_options,
    )
    _tool(
        "get_visualization",
        "read",
        "Get a saved visualization's current settings and tracks. Read before revising it: "
        "save_visualization replaces the config rather than merging into it.",
        {"visualization_id": _STR},
        ["visualization_id"],
        _get_visualization,
    )
    _tool(
        "get_visualization_details",
        "read",
        "Get one visualization's parameters, including the schema its settings and tracks must "
        "match. Call before binding settings or tracks.",
        {"visualization": _STR},
        ["visualization"],
        _get_visualization_details,
    )
    _tool(
        "show_visualization",
        "read",
        "Display a dataset with an installed visualization. Renders only; saves nothing. Takes the "
        "plugin's defaults -- use save_visualization to bind settings or tracks.",
        {"dataset_id": _STR, "visualization": _STR, "title": _STR},
        ["dataset_id", "visualization"],
        _show_visualization,
    )
    _tool(
        "save_visualization",
        "write",
        "Save a Galaxy visualization of a dataset, the durable kind the user keeps. Needed to "
        "bind settings or tracks, which a displayed visualization cannot carry. Pass "
        "visualization_id to revise one already saved instead of adding another.",
        {
            "dataset_id": _STR,
            "visualization": _STR,
            "title": _STR,
            "visualization_id": _STR,
            "settings": {"type": "object"},
            "tracks": {"type": "array", "items": {"type": "object"}},
        },
        ["dataset_id", "visualization"],
        _save_visualization,
    )
    _tool(
        "vega_dataset",
        "read",
        "Chart one tabular Galaxy dataset with a Vega-Lite specification you write, rendered "
        "inline and placeable in the record with {{artifact}}. Leave `data` out of the spec: it "
        "is pointed at the dataset here, so the chart reads the file rather than carrying a copy "
        "of it. Refer to columns as this dataset names them, `col:1`, `col:2` and so on where it "
        "names none. For a chart of something the dataset does not hold, make a derived dataset "
        "with a Galaxy tool and chart that. Where an installed visualization fits, "
        "save_visualization keeps a Galaxy object instead.",
        {
            "dataset_id": _STR,
            "spec": {"type": "object"},
            "title": _STR,
        },
        ["dataset_id", "spec"],
        _vega_dataset,
    )
    _tool(
        "list_visualizations",
        "read",
        "List the Galaxy visualizations that can display a dataset.",
        {"dataset_id": _STR},
        ["dataset_id"],
        _list_visualizations,
    )
