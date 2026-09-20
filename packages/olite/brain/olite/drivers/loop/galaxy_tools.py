"""Orbit-compatible named Galaxy tools, cloned from galaxy-mcp."""

import json

from . import page_edit
from .paging import ROW_CAP, page
from .tool_inputs import build_input_template, summarize_tool_inputs
import os
import sys
import tempfile
from urllib.parse import urlencode

from .galaxy_tool_docs import DOCS

TOOLS = []

# Pyodide's MEMFS is olite's equivalent of the filesystem Orbit has on disk.
DATA_DIR = "/data" if sys.platform == "emscripten" else os.path.join(tempfile.gettempdir(), "olite-data")
# Enough to show the header and shape of a table without a run_python round trip.
PREVIEW_LINES = 50
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024
PREVIEW_BYTES = 256 * 1024


def _q(params):
    """Query string from a dict; drop None, lowercase bools (Galaxy wants true/false)."""
    clean = {}
    for k, v in params.items():
        if v is None:
            continue
        clean[k] = str(v).lower() if isinstance(v, bool) else v
    return ("?" + urlencode(clean)) if clean else ""


def _tool(name, capability, description, properties, required, handler):
    # galaxy-mcp's verbatim docstring is the model-facing description (see
    TOOLS.append(
        {
            "name": name,
            "capability": capability,
            "handler": handler,
            "schema": {
                "type": "function",
                "function": {
                    "name": name,
                    "description": DOCS.get(name, description),
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": list(required),
                    },
                },
            },
        }
    )


# --- core tier ---------------------------------------------------------------


async def _get_server_info(g, a):
    return {"version": await g.get("api/version"), "configuration": await g.get("api/configuration")}


async def _get_user(g, a):
    return await g.get("api/whoami")


async def _get_histories(g, a):
    params = {"limit": a.get("limit", ROW_CAP), "offset": a.get("offset", 0)}
    if a.get("name"):
        params["q"] = "name-contains"
        params["qv"] = a["name"]
    return await g.get(f"api/histories{_q(params)}")


async def _list_history_ids(g, a):
    histories = await g.get("api/histories?keys=id,name") or []
    return [{"id": h.get("id"), "name": h.get("name")} for h in histories]


CONTENTS_NOTE = ("This is just a count. To get actual datasets, use "
                 "get_history_contents(history_id, limit=25, order='create_time-dsc') "
                 "for newest datasets first.")


async def _get_history_details(g, a):
    history = await g.get(f"api/histories/{a['history_id']}")
    contents = await g.get(f"api/histories/{a['history_id']}/contents{_q({'v': 'dev', 'keys': 'id'})}")
    total = len(contents) if isinstance(contents, list) else 0
    return {"history": history,
            "contents_summary": {"total_items": total, "note": CONTENTS_NOTE}}


# Galaxy returns the underlying Dataset id beside the HDA id. Both encode the same way, so
# the wrong one resolves to an unrelated object instead of erroring.
CONFUSABLE_ID_FIELDS = ("dataset_id",)


def _one_identifier(item):
    """Leave exactly one id a dataset-taking tool accepts."""
    if not isinstance(item, dict):
        return item
    return {k: v for k, v in item.items() if k not in CONFUSABLE_ID_FIELDS}


async def _get_history_contents(g, a):
    params = {
        "limit": a.get("limit", 100),
        "offset": a.get("offset", 0),
        "deleted": a.get("deleted", False),
        "visible": a.get("visible", True),
        "order": a.get("order", "hid-asc"),
    }
    items = await g.get(f"api/histories/{a['history_id']}/contents{_q(params)}")
    if isinstance(items, list):
        return [_one_identifier(i) for i in items]
    return items


async def _create_history(g, a):
    return await g.post("api/histories", {"name": a["history_name"]})


def _hda_inputs(inputs):
    """Every `{src: hda, id: ...}` in a tool payload, with the field that carries it."""
    found = []

    def walk(name, value):
        if isinstance(value, dict):
            if value.get("src") == "hda" and value.get("id"):
                found.append((name, value["id"]))
                return
            for key, item in value.items():
                walk(f"{name}.{key}" if name else key, item)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                walk(f"{name}[{index}]", item)

    walk("", inputs or {})
    return found


async def _foreign_inputs(g, inputs, history_id):
    """Dataset inputs that belong to a history other than the one the job will run in."""
    foreign = []
    for name, dataset_id in _hda_inputs(inputs):
        detail = await g.get(f"api/datasets/{dataset_id}") or {}
        where = detail.get("history_id") if isinstance(detail, dict) else None
        if where and where != history_id:
            foreign.append({"input": name, "supplied_id": dataset_id,
                            "resolves_to_history_id": where, "resolves_to_name": detail.get("name")})
    return foreign


class ToolParameterError(Exception):
    """A rejected parameter, carrying the template the tool actually accepts."""

    def __init__(self, detail, template):
        super().__init__(
            f"{detail}\nThe tool accepts these input keys. Fill this template and resend:\n"
            f"{json.dumps(template, indent=1)}"
        )


def _is_parameter_error(exc):
    return "invalid key structure" in str(exc) or "has no attribute" in str(exc)


async def _input_template_for(g, tool_id):
    try:
        info = await g.get(f"api/tools/{tool_id}{_q({'io_details': True})}")
        return build_input_template(info) if info else None
    except Exception:
        return None


async def _run_tool(g, a):
    history_id = a["history_id"]
    inputs = a.get("inputs") or {}
    foreign = await _foreign_inputs(g, inputs, history_id)
    if foreign:
        return {
            "submitted": False,
            "error": "Refused: an input id does not identify a dataset in the target history.",
            "target_history_id": history_id,
            "rejected_inputs": foreign,
            "hint": "Use the `id` field of a dataset returned by get_history_contents for this "
                    "history. To use data from elsewhere, copy it into this history first.",
        }
    try:
        return await g.post(
            "api/tools",
            {"history_id": history_id, "tool_id": a["tool_id"], "inputs": inputs},
        )
    except Exception as exc:
        template = await _input_template_for(g, a["tool_id"]) if _is_parameter_error(exc) else None
        if template is None:
            raise
        # Galaxy names the offending key but not the shape it wanted; OLite holds it.
        raise ToolParameterError(str(exc), template) from exc


async def _search_tools_by_name(g, a):
    return await g.get(f"api/tools{_q({'q': a['query']})}")


async def _get_tool_details(g, a):
    return await g.get(f"api/tools/{a['tool_id']}{_q({'io_details': a.get('io_details', False)})}")


async def _get_job_details(g, a):
    dataset = await g.get(f"api/datasets/{a['dataset_id']}") or {}
    job_id = dataset.get("creating_job")
    if not job_id:
        return {"error": "no creating job for dataset", "dataset_id": a["dataset_id"]}
    return await g.get(f"api/jobs/{job_id}{_q({'full': True})}")


async def _get_dataset_details(g, a):
    dataset = await g.get(f"api/datasets/{a['dataset_id']}") or {}
    if a.get("include_preview", True):
        try:
            want = int(a.get("preview_lines", 10) or 10)
            text = await _chunk(g, a["dataset_id"], PREVIEW_BYTES)
            if text is None:
                content = await g.get(f"api/datasets/{a['dataset_id']}/display")
                text = content if isinstance(content, str) else json.dumps(content)
            dataset = dict(dataset)
            dataset["preview"] = "\n".join(text.splitlines()[:want])
        except Exception:
            pass
    return dataset


_STR = {"type": "string"}
_INT = {"type": "integer"}
_BOOL = {"type": "boolean"}

_tool("get_server_info", "read", "Get the connected Galaxy server's version and configuration.", {}, [], _get_server_info)
_tool("get_user", "read", "Get the current authenticated Galaxy user.", {}, [], _get_user)
_tool(
    "get_histories", "read",
    "List the user's histories. Optional name filter; supports limit/offset paging.",
    {"limit": _INT, "offset": _INT, "name": _STR}, [], _get_histories,
)
_tool("list_history_ids", "read", "List just the id and name of each of the user's histories.", {}, [], _list_history_ids)
_tool("get_history_details", "read", "Get full details of one history by id.", {"history_id": _STR}, ["history_id"], _get_history_details)
_tool(
    "get_history_contents", "read",
    "List datasets and collections in a history (hid-ordered; paged).",
    {
        "history_id": _STR, "limit": _INT, "offset": _INT,
        "deleted": _BOOL, "visible": _BOOL, "order": _STR,
    },
    ["history_id"], _get_history_contents,
)
_tool("create_history", "write", "Create a new history.", {"history_name": _STR}, ["history_name"], _create_history)
_tool(
    "run_tool", "write",
    "Run a Galaxy tool in a history. inputs maps the tool's parameter names to values "
    "({id, src:'hda'|'hdca'} for datasets). Returns the created job and output ids.",
    {"history_id": _STR, "tool_id": _STR, "inputs": {"type": "object"}},
    ["history_id", "tool_id", "inputs"], _run_tool,
)
_tool(
    "search_tools_by_name", "read",
    "Search the connected Galaxy's tool catalog by name/text. Returns matching Galaxy tools.",
    {"query": _STR}, ["query"], _search_tools_by_name,
)
_tool(
    "get_tool_details", "read",
    "Get a Galaxy tool's details by tool_id; set io_details for its input/output schema.",
    {"tool_id": _STR, "io_details": _BOOL}, ["tool_id"], _get_tool_details,
)
_tool(
    "get_job_details", "read",
    "Get the job that produced a dataset (by dataset_id), including its state and parameters.",
    {"dataset_id": _STR, "history_id": _STR}, ["dataset_id"], _get_job_details,
)
_tool(
    "get_dataset_details", "read",
    "Get a dataset's metadata; include a short content preview by default.",
    {"dataset_id": _STR, "include_preview": _BOOL, "preview_lines": _INT},
    ["dataset_id"], _get_dataset_details,
)


# --- extended tier: tools, datasets, workflows, pages, user tools ------------


async def _update_history(g, a):
    updates = {k: a[k] for k in ("name", "annotation", "tags", "deleted", "published") if a.get(k) is not None}
    return await g.put(f"api/histories/{a['history_id']}", updates)


async def _search_tools_by_keywords(g, a):
    return await g.get(f"api/tools{_q({'q': ' '.join(a.get('keywords') or [])})}")


PANEL_STRUCTURAL = {"ToolSection", "ToolSectionLabel"}
PANEL_KEEP = ("id", "name", "description")


def _panel_entry(entry):
    return {k: entry[k] for k in PANEL_KEEP if entry.get(k)}


def _count_panel(entries):
    """Tools and sections in a panel subtree."""
    tools = sections = 0
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        if entry.get("model_class") == "ToolSection":
            sections += 1
            sub_tools, sub_sections = _count_panel(entry.get("elems"))
            tools += sub_tools
            sections += sub_sections
        elif entry.get("model_class") not in PANEL_STRUCTURAL:
            tools += 1
    return tools, sections


async def _get_tool_panel(g, a):
    """Sections and their tools, counted."""
    panel = await g.get("api/tools?in_panel=true")
    if not isinstance(panel, list):
        return panel
    tools, sections = _count_panel(panel)
    out = []
    for entry in panel:
        if entry.get("model_class") == "ToolSection":
            out.append({
                "section": entry.get("name"),
                "tools": [_panel_entry(e) for e in entry.get("elems") or []
                          if e.get("model_class") not in PANEL_STRUCTURAL],
            })
        elif entry.get("model_class") not in PANEL_STRUCTURAL:
            out.append(_panel_entry(entry))
    if a.get("section"):
        needle = _alnum(a["section"])
        out = [s for s in out if needle in _alnum(s.get("section"))]
    result = page(out, a.get("offset"), a.get("limit"))
    result["tool_count"] = tools
    result["section_count"] = sections
    return result


async def _get_tool_citations(g, a):
    info = await g.get(f"api/tools/{a['tool_id']}") or {}
    citations = info.get("citations") or []
    return {"tool_name": info.get("name", a["tool_id"]),
            "tool_version": info.get("version", "unknown"),
            "citations": citations}


async def _get_tool_input_template(g, a):
    # galaxy-mcp builds the skeleton the description promises.
    info = await g.get(f"api/tools/{a['tool_id']}{_q({'io_details': True})}") or {}
    return {
        "tool_id": a["tool_id"],
        "inputs_template": build_input_template(info),
        "parameters": summarize_tool_inputs(info),
    }


async def _get_tool_run_examples(g, a):
    tid = a["tool_id"]
    ver = a.get("tool_version")
    path = f"api/tools/{tid}/versions/{ver}/interop" if ver else f"api/tools/{tid}/interop"
    return await g.get(path)


COLLECTION_ELEMENT_CAP = 100


async def _get_collection_details(g, a):
    got = await g.get(f"api/dataset_collections/{a['collection_id']}?instance_type=history")
    if not isinstance(got, dict):
        return got
    limit = int(a.get("max_elements") or COLLECTION_ELEMENT_CAP)
    elements = got.get("elements")
    if isinstance(elements, list) and len(elements) > limit:
        return {**got, "elements": elements[:limit], "elements_truncated": True,
                "elements_shown": limit, "element_count": got.get("element_count", len(elements))}
    return got


async def _chunk(g, dataset_id, size):
    """A line-aligned prefix, or None if the datatype cannot be chunked."""
    try:
        got = await g.get(f"api/datasets/{dataset_id}/display?offset=0&ck_size={size}")
    except Exception:
        return None
    return got.get("ck_data") if isinstance(got, dict) else None


async def _download_dataset(g, a):
    # Written to the filesystem as bytes.
    details = await g.get(f"api/datasets/{a['dataset_id']}") or {}
    stated = details.get("file_size") if isinstance(details, dict) else None
    partial = False
    if isinstance(stated, int) and stated > MAX_DOWNLOAD_BYTES:
        # Galaxy's chunked display: line-aligned, and it refuses binary itself.
        chunk = await _chunk(g, a["dataset_id"], MAX_DOWNLOAD_BYTES)
        if chunk is None:
            return {
                "error": (
                    f"Dataset is {stated / 1e6:.1f} MB and cannot be read in chunks. "
                    "Run a Galaxy tool on it instead."
                ),
                "dataset_id": a["dataset_id"],
                "bytes": stated,
            }
        data, partial = chunk.encode("utf-8"), True
    else:
        data = await g.get(f"api/datasets/{a['dataset_id']}/display", binary=True)
    if isinstance(data, str):  # a stub or a JSON-ish response
        data = data.encode("utf-8")
    os.makedirs(DATA_DIR, exist_ok=True)
    path = f"{DATA_DIR}/{a['dataset_id']}.dat"
    with open(path, "wb") as f:
        f.write(data)

    out = {"dataset_id": a["dataset_id"], "path": path, "bytes": len(data)}
    if partial:
        out.update(partial=True, bytes_total=stated)
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        # Binary: a preview would be meaningless and would corrupt the transcript.
        out.update(binary=True, preview=None, lines=None, truncated=False)
        return out
    lines = text.splitlines()
    out.update(
        binary=False,
        lines=len(lines),
        preview="\n".join(lines[:PREVIEW_LINES]),
        truncated=len(lines) > PREVIEW_LINES,
    )
    return out


async def _upload_file_from_url(g, a):
    element = {"src": "url", "url": a["url"], "ext": a.get("file_type", "auto"), "dbkey": a.get("dbkey", "?")}
    if a.get("file_name"):
        element["name"] = a["file_name"]
    payload = {"targets": [{"destination": {"type": "hdas"}, "elements": [element]}]}
    if a.get("history_id"):
        payload["history_id"] = a["history_id"]
    return await g.post("api/tools/fetch", payload)


async def _upload_file(g, a):
    # The counterpart to download_dataset.
    path = a["path"]
    if not os.path.isfile(path):
        return {"error": f"No such file: {path}", "path": path}
    with open(path, "rb") as f:
        raw = f.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        # Pasted content goes up as text, so binary is refused.
        return {
            "error": "Cannot upload binary content: Galaxy accepts pasted uploads as text only. "
            "Use upload_file_from_url for binary data.",
            "path": path,
            "bytes": len(raw),
        }
    element = {
        "src": "pasted",
        "paste_content": text,
        "ext": a.get("file_type", "auto"),
        "dbkey": a.get("dbkey", "?"),
        "name": a.get("file_name") or os.path.basename(path),
    }
    payload = {"targets": [{"destination": {"type": "hdas"}, "elements": [element]}]}
    if a.get("history_id"):
        payload["history_id"] = a["history_id"]
    return await g.post("api/tools/fetch", payload)


def _alnum(text):
    return "".join(c for c in (text or "").lower() if c.isalnum())


async def _list_workflows(g, a):
    params = {"show_published": a.get("published", False)}
    workflows = await g.get(f"api/workflows{_q(params)}") or []
    if a.get("name"):
        # Galaxy's ?search drops short terms, so match name and tags here instead.
        needle = _alnum(a["name"])
        workflows = [
            w for w in workflows
            if needle in _alnum(w.get("name"))
            or any(needle in _alnum(t) for t in w.get("tags") or [])
        ]
    if a.get("workflow_id"):
        workflows = [w for w in workflows if w.get("id") == a["workflow_id"]]
    return page(workflows, a.get("offset"), a.get("limit"))


async def _get_workflow_details(g, a):
    return await g.get(f"api/workflows/{a['workflow_id']}{_q({'version': a.get('version')})}")


WORKFLOW_INPUT_STEPS = {"data_input", "data_collection_input", "parameter_input"}
EXTENSION_LIST_CAP = 12


def _trim_extensions(value):
    if isinstance(value, list) and len(value) > EXTENSION_LIST_CAP:
        return {"count": len(value), "note": "accepts most datatypes"}
    return value


def _input_step(step):
    """Populates the input step."""
    inputs = []
    for item in step.get("inputs") or []:
        if not isinstance(item, dict):
            continue
        inputs.append({k: (_trim_extensions(v) if k == "acceptable_extensions" else v)
                       for k, v in item.items()
                       if k in ("name", "label", "optional", "acceptable_extensions",
                                "collection_type", "value", "type")})
    return {
        "step_index": step.get("step_index"),
        "label": step.get("step_label"),
        "name": step.get("step_name"),
        "type": step.get("step_type"),
        "annotation": step.get("annotation"),
        "inputs": inputs,
    }


async def _get_workflow_input_template(g, a):
    """The inputs a workflow asks for, and any version warnings Galaxy raises."""
    # style=run also validates that every tool is installed, so a missing one surfaces.
    params = {"style": "run", "instance": "false", "history_id": a.get("history_id")}
    model = await g.get(f"api/workflows/{a['workflow_id']}/download{_q(params)}")
    if not isinstance(model, dict) or "steps" not in model:
        return model
    steps = [s for s in model["steps"] if isinstance(s, dict)
             and s.get("step_type") in WORKFLOW_INPUT_STEPS]
    return {
        "workflow_id": a["workflow_id"],
        "name": model.get("name"),
        "history_id": model.get("history_id"),
        "has_upgrade_messages": model.get("has_upgrade_messages"),
        "step_version_changes": model.get("step_version_changes"),
        "inputs_by": "step_index",
        "inputs": [_input_step(s) for s in steps],
    }


async def _invoke_workflow(g, a):
    body = {"inputs": a.get("inputs") or {}, "inputs_by": a.get("inputs_by", "step_index")}
    if a.get("params"):
        body["parameters"] = a["params"]
    if a.get("history_id"):
        body["history_id"] = a["history_id"]
    elif a.get("history_name"):
        body["new_history_name"] = a["history_name"]
    return await g.post(f"api/workflows/{a['workflow_id']}/invocations", body)


async def _cancel_workflow_invocation(g, a):
    result = await g.delete(f"api/invocations/{a['invocation_id']}")
    return {"cancelled": True, "invocation": result}


async def _get_invocations(g, a):
    if a.get("invocation_id"):
        return await g.get(f"api/invocations/{a['invocation_id']}{_q({'step_details': a.get('step_details', False)})}")
    params = {
        "workflow_id": a.get("workflow_id"),
        "history_id": a.get("history_id"),
        "limit": a.get("limit"),
        "view": a.get("view", "collection"),
        "step_details": a.get("step_details", False),
    }
    return await g.get(f"api/invocations{_q(params)}")


NUMERIC_COLUMNS = frozenset({"int", "float"})


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
    preferred = await _preferred_visualizations(g, extension)
    matching.sort(key=lambda p: p.get("name") not in preferred)

    # Answers only "what can render this". The dataset's columns belong to
    # get_dataset_details: bundling them here made a column lookup double as a plugin
    # advertisement, and tabular charts drifted away from vintent_dataset because of it.
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
            "recognised, or use vintent_dataset, which reads the file contents directly and works "
            "on tabular data."
        )
    return result


# Chrome-free: Galaxy drops the masthead inside any iframe, hide_panels drops the rest.
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
            "error": f"Refused: {name!r} cannot render the datatype "
                     f"{dataset.get('extension')!r}.",
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
        "artifact": {"kind": "visualization", "title": title,
                     "visualization": name, "dataset_id": a["dataset_id"],
                     "url": f"/visualizations/display{_q(query)}"},
        "hint": "The visualization is displayed to the user. Nothing was added to Galaxy, so "
                "call save_visualization if they ask to keep it. Say what it shows and finish.",
    }


async def _save_visualization(g, a):
    dataset, refusal = await _resolve_visualization(g, a)
    if refusal:
        return {"saved": False, **refusal}

    name = a["visualization"]
    title = a.get("title") or f"{name} of {dataset.get('name') or a['dataset_id']}"
    config = _visualization_config(a)

    # Revising one visualization rather than adding another: Galaxy keeps the revisions, and
    # the user's list does not grow every time the settings change.
    visualization_id = a.get("visualization_id")
    if visualization_id:
        await g.put(f"api/visualizations/{visualization_id}", {"title": title, "config": config})
    else:
        created = await g.post("api/visualizations",
                               {"type": name, "title": title, "config": config})
        visualization_id = (created or {}).get("id")
    # Galaxy reads the plugin name from the query, never from the saved object.
    query = {"visualization": name, "visualization_id": visualization_id, **_EMBED}
    artifact = {"kind": "visualization", "title": title,
                "visualization": name, "dataset_id": a["dataset_id"],
                "url": f"/visualizations/display{_q(query)}"}
    artifact.update({k: a[k] for k in ("settings", "tracks") if a.get(k)})
    return {
        "saved": True,
        "visualization_id": visualization_id,
        "title": title,
        "artifact": artifact,
        "hint": "Saved to the user's visualizations and displayed. It is not a history dataset. "
                "Say what it shows and finish.",
    }


# api/dynamic_tools is admin-only; a user's own tools live behind api/unprivileged_tools.
async def _list_user_tools(g, a):
    return await g.get(f"api/unprivileged_tools{_q({'active': a.get('active', True)})}")


async def _create_user_tool(g, a):
    return await g.post("api/unprivileged_tools", {"representation": a["representation"]})


async def _delete_user_tool(g, a):
    await g.delete(f"api/unprivileged_tools/{a['uuid']}")
    return {"uuid": a["uuid"], "deactivated": True}


async def _run_user_tool(g, a):
    return await g.post(
        "api/tools",
        {"history_id": a["history_id"], "tool_uuid": a["tool_uuid"], "inputs": a.get("inputs") or {}},
    )


async def _list_pages(g, a):
    params = {
        "search": a.get("search"),
        "limit": a.get("limit", 100),
        "offset": a.get("offset", 0),
        "show_published": a.get("show_published", False),
        "show_shared": a.get("show_shared", False),
    }
    pages = await g.get(f"api/pages{_q(params)}") or []
    if a.get("history_id"):
        pages = [p for p in pages if p.get("history_id") == a["history_id"]]
    return pages


async def _get_page(g, a):
    result = await g.get(f"api/pages/{a['page_id']}") or {}
    if isinstance(result, dict):
        result = dict(result)
        result["content_hash"] = page_edit.djb2_hash(
            result.get("content_editor") or result.get("content") or "")
        if not a.get("include_rendered"):
            result.pop("content", None)
    return result


async def _create_page(g, a):
    payload = {k: a[k] for k in ("title", "content", "annotation", "slug") if a.get(k) is not None}
    payload.setdefault("edit_source", "agent")
    if a.get("history_id"):
        payload["history_id"] = a["history_id"]
    # Galaxy defaults a page to html and sanitizes the body against that.
    payload["content_format"] = "markdown"
    return await g.post("api/pages", payload)


async def _update_page(g, a):
    payload = {k: a[k] for k in ("title", "content") if a.get(k) is not None}
    payload.setdefault("edit_source", "agent")

    heading, section = a.get("section_heading"), a.get("section_content")
    expect = a.get("expect_hash")
    if heading or section or expect:
        current = await g.get(f"api/pages/{a['page_id']}") or {}
        source = current.get("content_editor") or current.get("content") or ""
        actual = page_edit.djb2_hash(source)
        if expect and expect != actual:
            return {
                "written": False,
                "reason": "the page changed since you read it",
                "content_hash": actual,
                "content": source,
            }
        if heading and section is not None:
            payload["content"] = page_edit.apply_section_edit(source, heading, section)

    written = await g.put(f"api/pages/{a['page_id']}", payload)
    if isinstance(written, dict):
        body = written.get("content_editor") or written.get("content") or ""
        written["content_hash"] = page_edit.djb2_hash(body)
    return written


async def _list_page_revisions(g, a):
    revisions = await g.get(f"api/pages/{a['page_id']}/revisions") or []
    if a.get("sort_desc") and isinstance(revisions, list):
        revisions = list(reversed(revisions))
    return revisions


async def _get_page_revision(g, a):
    return await g.get(f"api/pages/{a['page_id']}/revisions/{a['revision_id']}")


async def _revert_page_revision(g, a):
    return await g.post(f"api/pages/{a['page_id']}/revisions/{a['revision_id']}/revert", {})


_tool("update_history", "write", "Update a history's name, annotation, tags, or deleted/published flags.",
      {"history_id": _STR, "name": _STR, "annotation": _STR, "tags": {"type": "array", "items": _STR},
       "deleted": _BOOL, "published": _BOOL}, ["history_id"], _update_history)
_tool("search_tools_by_keywords", "read", "Search the Galaxy tool catalog by a list of keywords.",
      {"keywords": {"type": "array", "items": _STR}}, ["keywords"], _search_tools_by_keywords)
_tool("get_tool_panel", "read", "Get the Galaxy tool panel (sections and tools); optional section filter, limit/offset paging.",
      {"section": _STR, "limit": _INT, "offset": _INT}, [], _get_tool_panel)
_tool("get_tool_citations", "read", "Get a tool's citations (bibtex).", {"tool_id": _STR}, ["tool_id"], _get_tool_citations)
_tool("get_tool_input_template", "read", "Get a tool's input parameter schema (a fillable template).",
      {"tool_id": _STR}, ["tool_id"], _get_tool_input_template)
_tool("get_tool_run_examples", "read", "Get structural example inputs for a tool.",
      {"tool_id": _STR, "tool_version": _STR}, ["tool_id"], _get_tool_run_examples)
_tool("get_collection_details", "read", "Get a dataset collection's details and elements.",
      {"collection_id": _STR, "max_elements": _INT}, ["collection_id"], _get_collection_details)
_tool("download_dataset", "read",
      "Save a dataset to the local filesystem and return its path plus a short preview. "
      "A dataset over 20 MB comes back as a line-aligned prefix with partial=true and "
      "bytes_total set; never compute totals or counts from a partial read. "
      "Read the file with run_python (e.g. pandas.read_csv(path, sep='\\t')); do not paste "
      "the preview into code.",
      {"dataset_id": _STR, "require_ok_state": _BOOL}, ["dataset_id"], _download_dataset)
_tool("upload_file_from_url", "write", "Upload a dataset into a history from a URL.",
      {"url": _STR, "history_id": _STR, "file_type": _STR, "dbkey": _STR, "file_name": _STR}, ["url"], _upload_file_from_url)
_tool("upload_file", "write",
      "Upload a file from the local filesystem to a history -- e.g. one written by run_python.",
      {"path": _STR, "history_id": _STR, "file_name": _STR, "file_type": _STR, "dbkey": _STR},
      ["path"], _upload_file)
_tool("list_workflows", "read", "List stored workflows; optional name/tag/id filter, published flag, "
      "limit/offset paging.",
      {"workflow_id": _STR, "name": _STR, "published": _BOOL, "limit": _INT, "offset": _INT},
      [], _list_workflows)
_tool("get_workflow_details", "read", "Get a stored workflow's details.",
      {"workflow_id": _STR, "version": _INT}, ["workflow_id"], _get_workflow_details)
_tool("get_workflow_input_template", "read", "Get a workflow's run-form input template (fill and pass to invoke_workflow).",
      {"workflow_id": _STR, "history_id": _STR}, ["workflow_id"], _get_workflow_input_template)
_tool("invoke_workflow", "write", "Run a workflow. inputs maps input steps to datasets ({id, src}); "
      "give history_id or history_name for the output history.",
      {"workflow_id": _STR, "inputs": {"type": "object"}, "params": {"type": "object"},
       "history_id": _STR, "history_name": _STR, "inputs_by": _STR}, ["workflow_id"], _invoke_workflow)
_tool("cancel_workflow_invocation", "write", "Cancel a running workflow invocation.",
      {"invocation_id": _STR}, ["invocation_id"], _cancel_workflow_invocation)
_tool("get_invocations", "read", "List workflow invocations, or one by id.",
      {"invocation_id": _STR, "workflow_id": _STR, "history_id": _STR, "limit": _INT, "view": _STR, "step_details": _BOOL},
      [], _get_invocations)
_tool("list_user_tools", "read", "List the user's dynamic (user-defined) tools.", {"active": _BOOL}, [], _list_user_tools)
_tool("create_user_tool", "write", "Create a dynamic (user-defined) tool from a representation.",
      {"representation": {"type": "object"}}, ["representation"], _create_user_tool)
_tool("delete_user_tool", "write", "Delete a dynamic tool by uuid.", {"uuid": _STR}, ["uuid"], _delete_user_tool)
_tool("run_user_tool", "write", "Run a dynamic (user-defined) tool by uuid in a history.",
      {"history_id": _STR, "tool_uuid": _STR, "inputs": {"type": "object"}},
      ["history_id", "tool_uuid", "inputs"], _run_user_tool)
_tool("show_visualization", "read",
      "Display a dataset with an installed visualization. Renders only; saves nothing. Takes the "
      "plugin's defaults -- use save_visualization to bind settings or tracks.",
      {"dataset_id": _STR, "visualization": _STR, "title": _STR},
      ["dataset_id", "visualization"], _show_visualization)
_tool("save_visualization", "write",
      "Save a Galaxy visualization of a dataset, the durable kind the user keeps. Needed to "
      "bind settings or tracks, which a displayed visualization cannot carry. Pass "
      "visualization_id to revise one already saved instead of adding another.",
      {"dataset_id": _STR, "visualization": _STR, "title": _STR, "visualization_id": _STR,
       "settings": {"type": "object"}, "tracks": {"type": "array", "items": {"type": "object"}}},
      ["dataset_id", "visualization"], _save_visualization)
_tool("list_visualizations", "read",
      "List the Galaxy visualizations that can display a dataset.",
      {"dataset_id": _STR}, ["dataset_id"], _list_visualizations)
_tool("list_pages", "read", "List pages (Galaxy markdown documents; a history-attached page is a Notebook).",
      {"history_id": _STR, "search": _STR, "limit": _INT, "offset": _INT, "show_published": _BOOL, "show_shared": _BOOL},
      [], _list_pages)
_tool("get_page", "read", "Get a page's editable content and metadata.",
      {"page_id": _STR, "include_rendered": _BOOL}, ["page_id"], _get_page)
_tool("create_page", "write", "Create a page (Notebook if history_id given, else a standalone Report).",
      {"history_id": _STR, "title": _STR, "content": _STR, "annotation": _STR, "slug": _STR}, [], _create_page)
_tool("update_page", "write",
      "Update a page. Give `section_heading` and `section_content` to replace one section, "
      "or `content` to replace the body. Pass `expect_hash` from when you read the page and "
      "the write is refused if someone edited it since.",
      {"page_id": _STR, "content": _STR, "title": _STR, "section_heading": _STR,
       "section_content": _STR, "expect_hash": _STR}, ["page_id"], _update_page)
_tool("list_page_revisions", "read", "List a page's edit revisions.",
      {"page_id": _STR, "sort_desc": _BOOL}, ["page_id"], _list_page_revisions)
_tool("get_page_revision", "read", "Get one page revision.",
      {"page_id": _STR, "revision_id": _STR}, ["page_id", "revision_id"], _get_page_revision)
_tool("revert_page_revision", "write", "Revert a page to an earlier revision.",
      {"page_id": _STR, "revision_id": _STR}, ["page_id", "revision_id"], _revert_page_revision)


# --- niche tier: IWC (external GitHub manifest, not the Galaxy API) -----------

_IWC_MANIFEST_URL = "https://iwc.galaxyproject.org/workflow_manifest.json"
_iwc_cache = {}


async def _iwc_manifest(g):
    from olite.substrate.http import http

    g.manifest.require("read")
    if "workflows" not in _iwc_cache:
        # The manifest is a list of collections; flatten to their workflows.
        raw = await http.request("GET", _IWC_MANIFEST_URL) or []
        workflows = []
        for collection in raw:
            workflows.extend(collection.get("workflows", []))
        _iwc_cache["workflows"] = workflows
    return _iwc_cache["workflows"]


def _iwc_entry(w):
    d = w.get("definition", {})
    return {
        "trsID": w.get("trsID", ""),
        "name": d.get("name", ""),
        "description": d.get("annotation", ""),
        "tags": d.get("tags", []),
        "categories": w.get("categories", []),
    }


async def _get_iwc_workflows(g, a):
    return [_iwc_entry(w) for w in await _iwc_manifest(g)]


async def _search_iwc_workflows(g, a):
    needle = (a.get("query") or "").lower()
    out = []
    for w in await _iwc_manifest(g):
        e = _iwc_entry(w)
        if needle in json.dumps(e).lower():
            out.append(e)
    return out


async def _recommend_iwc_workflows(g, a):
    hits = await _search_iwc_workflows(g, {"query": a.get("intent", "")})
    return hits[: a.get("limit", 5)]


async def _get_iwc_workflow_details(g, a):
    for w in await _iwc_manifest(g):
        if w.get("trsID") == a["trs_id"]:
            return w
    return {"error": "trs_id not found in IWC manifest", "trs_id": a["trs_id"]}


async def _import_workflow_from_iwc(g, a):
    details = await _get_iwc_workflow_details(g, {"trs_id": a["trs_id"]})
    if "error" in details:
        return details
    return await g.post("api/workflows", {"workflow": details.get("definition")})


_tool("get_iwc_workflows", "read", "List curated Interactive Workflow Composer (IWC) workflows.", {}, [], _get_iwc_workflows)
_tool("search_iwc_workflows", "read", "Search IWC workflows by text.", {"query": _STR}, ["query"], _search_iwc_workflows)
_tool("recommend_iwc_workflows", "read", "Recommend IWC workflows for a described intent.",
      {"intent": _STR, "limit": _INT}, ["intent"], _recommend_iwc_workflows)
_tool("get_iwc_workflow_details", "read", "Get a single IWC workflow by TRS id.", {"trs_id": _STR}, ["trs_id"], _get_iwc_workflow_details)
_tool("import_workflow_from_iwc", "write", "Import an IWC workflow into Galaxy by TRS id.", {"trs_id": _STR}, ["trs_id"], _import_workflow_from_iwc)


def tool_schemas(manifest):
    """Advertised tool schemas, filtered to the capabilities the manifest grants."""
    return [t["schema"] for t in TOOLS if manifest.allows(t["capability"])]


def get_handler(name):
    for t in TOOLS:
        if t["name"] == name:
            return t["handler"]
    return None
