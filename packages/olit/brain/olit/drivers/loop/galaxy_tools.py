"""Orbit-compatible named Galaxy tools, cloned from galaxy-mcp."""

import json
import os
import sys
import tempfile
from urllib.parse import urlencode

import jsonschema

from olit import vendor
from olit.substrate.http import http

from . import biocontainers, invocation_outcome, page_edit
from .galaxy_tool_docs import DOCS
from .outcome import ToolOutcome
from .paging import ROW_CAP, page, server_page
from .tool_inputs import build_input_template, summarize_tool_inputs
from .visualization_inputs import build_visualization_template, template_cases

TOOLS = []
HANDLERS = {}

# Pyodide's MEMFS is olit's equivalent of the filesystem Orbit has on disk.
DATA_DIR = "/data" if sys.platform == "emscripten" else os.path.join(tempfile.gettempdir(), "olit-data")
# Enough to show the header and shape of a table without a run_python round trip.
PREVIEW_LINES = 50
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024
PREVIEW_BYTES = 256 * 1024
# The log fields Galaxy adds to a job under `full=true`.
JOB_LOG_FIELDS = ("tool_stdout", "tool_stderr", "job_stdout", "job_stderr", "stdout", "stderr")
JOB_LOG_BYTES = 4 * 1024


def _q(params):
    """Query string from a dict; drop None, lowercase bools (Galaxy wants true/false)."""
    clean = {}
    for k, v in params.items():
        if v is None:
            continue
        clean[k] = str(v).lower() if isinstance(v, bool) else v
    return ("?" + urlencode(clean)) if clean else ""


def _tool(name, capability, description, properties, required, handler):
    # galaxy-mcp's verbatim docstring is the model-facing description.
    HANDLERS[name] = handler
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
    # galaxy-mcp returns every history by default; a browser transcript cannot hold that, so
    # the page is bounded. One row past the limit is fetched to report that there are more.
    limit = int(a.get("limit") or ROW_CAP)
    offset = max(0, int(a.get("offset") or 0))
    params = {"limit": limit + 1, "offset": offset}
    if a.get("name"):
        params["q"] = "name-contains"
        params["qv"] = a["name"]
    rows = await g.get(f"api/histories{_q(params)}")
    return server_page(rows, offset, limit) if isinstance(rows, list) else rows


async def _list_history_ids(g, a):
    histories = await g.get("api/histories?keys=id,name") or []
    return [{"id": h.get("id"), "name": h.get("name")} for h in histories]


CONTENTS_NOTE = (
    "This is just a count. To get actual datasets, use "
    "get_history_contents(history_id, limit=25, order='create_time-dsc') "
    "for newest datasets first."
)


async def _get_history_details(g, a):
    # Galaxy counts the history's items itself; listing every id to length it made the
    # cost of this call grow with the history.
    history = await g.get(f"api/histories/{a['history_id']}") or {}
    total = history.get("count") if isinstance(history, dict) else None
    return {"history": history, "contents_summary": {"total_items": total or 0, "note": CONTENTS_NOTE}}


# Galaxy returns the underlying Dataset id beside the HDA id. Both encode the same way, so
# the wrong one resolves to an unrelated object instead of erroring.
CONFUSABLE_ID_FIELDS = ("dataset_id",)


def _one_identifier(item):
    """Leave exactly one id a dataset-taking tool accepts."""
    if not isinstance(item, dict):
        return item
    return {k: v for k, v in item.items() if k not in CONFUSABLE_ID_FIELDS}


async def _get_history_contents(g, a):
    # galaxy-mcp fetches the whole history and pages it here, so it always knows the total.
    # Galaxy pages this one, which an 8,000-dataset history needs; one row past the limit is
    # what tells the caller there are more.
    limit = int(a.get("limit") or 100)
    offset = max(0, int(a.get("offset") or 0))
    params = {
        "limit": limit + 1,
        "offset": offset,
        "deleted": a.get("deleted", False),
        "visible": a.get("visible", True),
        "order": a.get("order", "hid-asc"),
    }
    items = await g.get(f"api/histories/{a['history_id']}/contents{_q(params)}")
    if not isinstance(items, list):
        return items
    return server_page([_one_identifier(i) for i in items], offset, limit)


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
            foreign.append(
                {
                    "input": name,
                    "supplied_id": dataset_id,
                    "resolves_to_history_id": where,
                    "resolves_to_name": detail.get("name"),
                }
            )
    return foreign


class ToolParameterError(Exception):
    """A rejected parameter, carrying the template the tool actually accepts."""

    def __init__(self, detail, template):
        super().__init__(
            f"{detail}\nThe tool accepts these input keys. Fill this template and resend:\n"
            f"{json.dumps(template, indent=1)}"
        )


# Galaxy says this in prose on the paths that answer 500 instead of rejecting the request.
PARAMETER_ERROR_PHRASES = ("invalid key structure", "has no attribute")


def _is_parameter_error(exc):
    """Whether the tool rejected the inputs, which is when its template is worth attaching."""
    if getattr(exc, "status_code", None) == 400:
        return True
    return any(phrase in str(exc) for phrase in PARAMETER_ERROR_PHRASES)


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
        return ToolOutcome(
            {
                "submitted": False,
                "error": "Refused: an input id does not identify a dataset in the target history.",
                "target_history_id": history_id,
                "rejected_inputs": foreign,
                "hint": "Use the `id` field of a dataset returned by get_history_contents for this "
                "history. To use data from elsewhere, copy it into this history first.",
            },
            is_error=True,
        )
    try:
        return await g.post(
            "api/tools",
            {"history_id": history_id, "tool_id": a["tool_id"], "inputs": inputs},
        )
    except Exception as exc:
        template = await _input_template_for(g, a["tool_id"]) if _is_parameter_error(exc) else None
        if template is None:
            raise
        # Galaxy names the offending key but not the shape it wanted; Olit holds it.
        raise ToolParameterError(str(exc), template) from exc


# Lookups over data Galaxy holds still for a session: the same question returns the same answer.
SETTLED = frozenset(
    {
        "search_tools_by_name",
        "search_tools_by_keywords",
        "get_visualization_details",
    }
)


def settled(name):
    """Whether repeating this call with the same arguments can produce anything new."""
    return name in SETTLED


def _no_tool_matched(query):
    # An empty list reads as an answer, so the same search comes back; say it is exhausted.
    return {
        "query": query,
        "tools": [],
        "hint": "No installed Galaxy tool matches this text. A near-identical query returns the "
        "same empty answer, so change the term or the route rather than searching again.",
    }


# This agent, and a standalone plugin that defers its chart to its own LLM at view time.
NOT_OFFERED = {"olit", "vintent"}


async def _a_visualization_named(g, query):
    """The installed visualization this query names, if the tool catalog is the wrong one."""
    wanted = (query or "").strip().lower()
    installed = await g.get("api/plugins") or []
    names = [p.get("name") for p in installed if p.get("name") not in NOT_OFFERED]
    return next((n for n in names if n and n.lower() == wanted), None)


async def _search_tools_by_name(g, a):
    found = await g.get(f"api/tools{_q({'q': a['query']})}")
    if found:
        return found
    plugin = await _a_visualization_named(g, a["query"])
    if plugin:
        return {
            "query": a["query"],
            "tools": [],
            "hint": f"{plugin!r} is a visualization, which the tool catalog does not hold. "
            f"list_visualizations names the ones that can render a given dataset.",
        }
    return _no_tool_matched(a["query"])


async def _get_tool_details(g, a):
    return await g.get(f"api/tools/{a['tool_id']}{_q({'io_details': a.get('io_details', False)})}")


async def _get_job_details(g, a):
    dataset = await g.get(f"api/datasets/{a['dataset_id']}") or {}
    job_id = dataset.get("creating_job")
    if not job_id:
        return ToolOutcome({"error": "no creating job for dataset", "dataset_id": a["dataset_id"]}, is_error=True)
    job = await g.get(f"api/jobs/{job_id}{_q({'full': True})}")
    if not isinstance(job, dict):
        return job
    # `full=true` is fetched for the stderr of a failed job and carries the whole log with it.
    job = dict(job)
    for field in JOB_LOG_FIELDS:
        if isinstance(job.get(field), str):
            job[field] = _ends(job[field], JOB_LOG_BYTES)
    return job


def _ends(text, cap):
    """Keep both ends of a log: the cause is usually at the end, the context at the start."""
    data = text.encode("utf-8", "replace")
    if len(data) <= cap:
        return text
    half = cap // 2
    # Cut on line boundaries at both ends.
    head = data[:half].rsplit(b"\n", 1)[0]
    tail = data[-half:].split(b"\n", 1)[-1]
    dropped = len(data) - len(head) - len(tail)
    return (
        f"{head.decode('utf-8', 'replace')}\n"
        f"[... {dropped} of {len(data)} bytes omitted ...]\n"
        f"{tail.decode('utf-8', 'replace')}"
    )


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
        except Exception as exc:
            # A dataset that is still running has nothing to read yet. Naming that beats an
            # absent field, which reads the same as a dataset with no content at all.
            dataset = dict(dataset)
            dataset["preview_unavailable"] = str(exc)
    return dataset


_STR = {"type": "string"}
_INT = {"type": "integer"}
_BOOL = {"type": "boolean"}

_tool(
    "get_server_info", "read", "Get the connected Galaxy server's version and configuration.", {}, [], _get_server_info
)
_tool("get_user", "read", "Get the current authenticated Galaxy user.", {}, [], _get_user)
_tool(
    "get_histories",
    "read",
    "List the user's histories. Optional name filter; supports limit/offset paging.",
    {
        "limit": {"type": "integer", "description": "Rows per page; the reply names next_offset when more remain."},
        "offset": {"type": "integer", "description": "Rows to skip, from a previous reply's next_offset."},
        "name": _STR,
    },
    [],
    _get_histories,
)
_tool(
    "list_history_ids", "read", "List just the id and name of each of the user's histories.", {}, [], _list_history_ids
)
_tool(
    "get_history_details",
    "read",
    "Get full details of one history by id.",
    {"history_id": _STR},
    ["history_id"],
    _get_history_details,
)
_tool(
    "get_history_contents",
    "read",
    "List datasets and collections in a history (hid-ordered; paged).",
    {
        "history_id": _STR,
        "limit": {"type": "integer", "description": "Rows per page; the reply names next_offset when more remain."},
        "offset": {"type": "integer", "description": "Rows to skip, from a previous reply's next_offset."},
        "deleted": _BOOL,
        "visible": _BOOL,
        "order": _STR,
    },
    ["history_id"],
    _get_history_contents,
)
_tool("create_history", "write", "Create a new history.", {"history_name": _STR}, ["history_name"], _create_history)
_tool(
    "run_tool",
    "write",
    "Run a Galaxy tool in a history. inputs maps the tool's parameter names to values "
    "({id, src:'hda'|'hdca'} for datasets). Returns the created job and output ids.",
    {"history_id": _STR, "tool_id": _STR, "inputs": {"type": "object"}},
    ["history_id", "tool_id", "inputs"],
    _run_tool,
)
_tool(
    "search_tools_by_name",
    "read",
    "Search the connected Galaxy's tool catalog by name/text. Returns matching Galaxy tools.",
    {"query": _STR},
    ["query"],
    _search_tools_by_name,
)
_tool(
    "get_tool_details",
    "read",
    "Get a Galaxy tool's details by tool_id; set io_details for its input/output schema.",
    {"tool_id": _STR, "io_details": _BOOL},
    ["tool_id"],
    _get_tool_details,
)
_tool(
    "get_job_details",
    "read",
    "Get the job that produced a dataset (by dataset_id), including its state and parameters.",
    {"dataset_id": _STR, "history_id": _STR},
    ["dataset_id"],
    _get_job_details,
)
_tool(
    "get_dataset_details",
    "read",
    "Get a dataset's metadata; include a short content preview by default.",
    {"dataset_id": _STR, "include_preview": _BOOL, "preview_lines": _INT},
    ["dataset_id"],
    _get_dataset_details,
)


# --- extended tier: tools, datasets, workflows, pages, user tools ------------


async def _update_history(g, a):
    updates = {k: a[k] for k in ("name", "annotation", "tags", "deleted", "published") if a.get(k) is not None}
    return await g.put(f"api/histories/{a['history_id']}", updates)


async def _search_tools_by_keywords(g, a):
    query = " ".join(a.get("keywords") or [])
    return await g.get(f"api/tools{_q({'q': query})}") or _no_tool_matched(query)


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
            out.append(
                {
                    "section": entry.get("name"),
                    "tools": [
                        _panel_entry(e)
                        for e in entry.get("elems") or []
                        if e.get("model_class") not in PANEL_STRUCTURAL
                    ],
                }
            )
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
    return {
        "tool_name": info.get("name", a["tool_id"]),
        "tool_version": info.get("version", "unknown"),
        "citations": citations,
    }


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
        return {
            **got,
            "elements": elements[:limit],
            "elements_truncated": True,
            "elements_shown": limit,
            "element_count": got.get("element_count", len(elements)),
        }
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
    # A dataset that is still processing has no content to read; its bytes so far are a
    # partial file that looks whole. galaxy-mcp guards this with require_ok_state.
    state = details.get("state") if isinstance(details, dict) else None
    if state != "ok":
        return ToolOutcome(
            {
                "error": (
                    f"Dataset is in state {state!r}, not 'ok', so it holds nothing to read yet. "
                    "Wait for the job producing it to finish and download it again."
                ),
                "dataset_id": a["dataset_id"],
                "state": state,
            },
            is_error=True,
        )
    stated = details.get("file_size") if isinstance(details, dict) else None
    partial = False
    if isinstance(stated, int) and stated > MAX_DOWNLOAD_BYTES:
        # Galaxy's chunked display: line-aligned, and it refuses binary itself.
        chunk = await _chunk(g, a["dataset_id"], MAX_DOWNLOAD_BYTES)
        if chunk is None:
            return ToolOutcome(
                {
                    "error": (
                        f"Dataset is {stated / 1e6:.1f} MB and cannot be read in chunks. "
                        "Run a Galaxy tool on it instead."
                    ),
                    "dataset_id": a["dataset_id"],
                    "bytes": stated,
                },
                is_error=True,
            )
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
    # From the details already fetched above: what Galaxy parsed this as, so the parser is
    # chosen from the server's own metadata rather than guessed off the preview.
    if isinstance(details, dict):
        for key, field in (("extension", "extension"), ("delimiter", "metadata_delimiter")):
            if details.get(field) is not None:
                out[key] = details[field]
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
    # Decompress on the way in, as Galaxy's uploader does.
    element = {
        "src": "url",
        "url": a["url"],
        "ext": a.get("file_type", "auto"),
        "dbkey": a.get("dbkey", "?"),
        "auto_decompress": True,
    }
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
        return ToolOutcome({"error": f"No such file: {path}", "path": path}, is_error=True)
    with open(path, "rb") as f:
        raw = f.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        # Pasted content goes up as text, so binary is refused.
        return ToolOutcome(
            {
                "error": "Cannot upload binary content: Galaxy accepts pasted uploads as text only. "
                "Use upload_file_from_url for binary data.",
                "path": path,
                "bytes": len(raw),
            },
            is_error=True,
        )
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
            w
            for w in workflows
            if needle in _alnum(w.get("name")) or any(needle in _alnum(t) for t in w.get("tags") or [])
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
    """The parts of an input step a caller has to fill."""
    inputs = []
    for item in step.get("inputs") or []:
        if not isinstance(item, dict):
            continue
        inputs.append(
            {
                k: (_trim_extensions(v) if k == "acceptable_extensions" else v)
                for k, v in item.items()
                if k in ("name", "label", "optional", "acceptable_extensions", "collection_type", "value", "type")
            }
        )
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
    steps = [s for s in model["steps"] if isinstance(s, dict) and s.get("step_type") in WORKFLOW_INPUT_STEPS]
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
    if a.get("parameters_normalized"):
        body["parameters_normalized"] = True
    if a.get("history_id"):
        body["history_id"] = a["history_id"]
    elif a.get("history_name"):
        body["new_history_name"] = a["history_name"]
    return await g.post(f"api/workflows/{a['workflow_id']}/invocations", body)


async def _cancel_workflow_invocation(g, a):
    result = await g.delete(f"api/invocations/{a['invocation_id']}")
    return {"cancelled": True, "invocation": result}


async def _job_states(g, invocation_id):
    try:
        summary = await g.get(f"api/invocations/{invocation_id}/jobs_summary")
    except Exception:
        return {}
    return (summary or {}).get("states") or {}


async def _get_invocations(g, a):
    if a.get("invocation_id"):
        one = await g.get(f"api/invocations/{a['invocation_id']}{_q({'step_details': a.get('step_details', False)})}")
        return invocation_outcome.described(one, await _job_states(g, a["invocation_id"]))
    params = {
        "workflow_id": a.get("workflow_id"),
        "history_id": a.get("history_id"),
        "limit": a.get("limit"),
        "view": a.get("view", "collection"),
        "step_details": a.get("step_details", False),
    }
    listed = await g.get(f"api/invocations{_q(params)}")
    if not isinstance(listed, list):
        return listed
    described = []
    for index, invocation in enumerate(listed):
        identifier = invocation.get("id") if isinstance(invocation, dict) else None
        if identifier and index < invocation_outcome.ROLLUP_LIMIT:
            described.append(invocation_outcome.described(invocation, await _job_states(g, identifier)))
        else:
            described.append(invocation)
    return described


NUMERIC_COLUMNS = frozenset({"int", "float"})
# A stored value can be a whole entry, so only the ones actually searched for are returned.
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


def _describe_parameter(param, types):
    """One declared input, joined with what galaxy-charts stores for its type."""
    kind = param.get("type")
    spec = types.get(kind) or {}
    described = {"name": param.get("name"), "type": kind}
    for key in ("label", "help"):
        if param.get(key):
            described[key] = param[key]
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
        described["options"] = options

    test = param.get("test_param")
    if test:
        described["chosen_by"] = _describe_parameter(test, types)
        described["cases"] = [
            {"when": c.get("value"), "inputs": [_describe_parameter(i, types) for i in (c.get("inputs") or [])]}
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
            {
                "error": f"Refused: {name!r} is not an installed visualization.",
                "hint": "Call list_visualizations for a dataset to see what this server offers.",
            },
            is_error=True,
        )

    types = (vendor.galaxy_charts_inputs() or {}).get("types") or {}
    template = build_visualization_template(plugin, types)
    other_cases = template_cases(plugin)
    return {
        "name": plugin.get("name"),
        "description": plugin.get("description"),
        # The shape to fill, as get_tool_input_template gives one for a Galaxy tool.
        "config_template": template,
        **({"other_cases": other_cases} if other_cases else {}),
        "settings": [_describe_parameter(p, types) for p in (plugin.get("settings") or [])],
        "tracks": [_describe_parameter(p, types) for p in (plugin.get("tracks") or [])],
        "hint": "`stores` is the shape each value must take. Build `settings` and `tracks` to "
        "them and pass them to save_visualization: settings cannot ride in a displayed "
        "visualization, only in a saved one.",
    }


def _find_declared(params, wanted, when=None):
    """Every declaration of a name, paired with the conditional case it sits in.

    A conditional can declare the same name in several cases with different sources: igv's
    `genome` is a remote list under one origin and a data table under another. Picking the
    first would resolve the wrong one silently.
    """
    found = []
    for param in params or []:
        if not isinstance(param, dict):
            continue
        if param.get("name") == wanted:
            found.append((when, param))
        test = param.get("test_param") or {}
        if test.get("name") == wanted:
            found.append((when, test))
        for case in param.get("cases") or []:
            found += _find_declared(case.get("inputs"), wanted, case.get("value"))
    return found


def _by_id(entries):
    """One entry per id, ordered by id, as galaxy-charts' dataTableStore offers them."""
    unique = {}
    for entry in entries:
        key = entry.get("id") or ""
        if key and key not in unique:
            unique[key] = entry
    return [unique[key] for key in sorted(unique)]


def _match(entry, search):
    if not search:
        return False
    hay = " ".join(str(entry.get(k) or "") for k in ("id", "name", "label", "value")).lower()
    return search.lower() in hay


async def _get_visualization_options(g, a):
    """What a parameter's options actually are, resolved from where the plugin says they live.

    The declaration says a genome comes from a remote list or a data table; it does not say
    what is in one. Without this the agent invents an option, and for a parameter whose value
    is an object copied verbatim it cannot invent a usable one.
    """
    name, wanted = a["visualization"], a["parameter"]
    plugin = await g.get(f"api/plugins/{name}") or {}
    if not isinstance(plugin, dict) or not plugin.get("name"):
        return ToolOutcome({"error": f"Refused: {name!r} is not an installed visualization."}, is_error=True)

    found = _find_declared(plugin.get("settings"), wanted) + _find_declared(plugin.get("tracks"), wanted)
    if not found:
        return ToolOutcome(
            {
                "error": f"Refused: {name!r} declares no parameter {wanted!r}.",
                "hint": f"Call get_visualization_details for {name!r} to see what it declares.",
            },
            is_error=True,
        )

    declared_cases = sorted({w for w, _ in found if w is not None})
    when = a.get("when")
    if when is not None:
        found = [(w, p) for w, p in found if w == when]
        if not found:
            return ToolOutcome({"error": f"Refused: {wanted!r} is not declared when {when!r}."}, is_error=True)
    if len(found) > 1:
        cases = sorted({w for w, _ in found if w is not None})
        return ToolOutcome(
            {
                "error": f"Refused: {name!r} declares {wanted!r} in more than one case, and "
                "they do not share a source.",
                "cases": cases,
                "hint": "Pass `when` with the case you mean.",
            },
            is_error=True,
        )
    declared = found[0][1]

    types = (vendor.galaxy_charts_inputs() or {}).get("types") or {}
    source = ((types.get(declared.get("type")) or {}).get("options")) or {}
    kind = source.get("kind")
    search = a.get("search")

    entries = []
    if kind == "declared":
        entries = [dict(o) for o in (declared.get("data") or [])]
    elif kind == "data_json":
        url = declared.get("url")
        if not url:
            return ToolOutcome({"error": f"{wanted!r} names no url to read its options from."}, is_error=True)
        fetched = await http.request("GET", url)
        entries = fetched if isinstance(fetched, list) else []
    elif kind == "data_table":
        # Follows galaxy-charts' dataTableStore, which owns this shape: the name and value
        # columns when the row is whole and the first column when it is not, then one entry
        # per id, ordered by id, which is the order the plugin's own form offers.
        for table in declared.get("tables") or []:
            data = await g.get(f"api/tool_data/{table}") or {}
            columns = data.get("columns") or []
            name_col = columns.index("name") if "name" in columns else 0
            value_col = columns.index("value") if "value" in columns else 0
            for row in data.get("fields") or []:
                whole = len(row) == len(columns)
                entries.append(
                    {
                        "id": row[value_col] if whole else (row[0] if row else None),
                        "name": row[name_col] if whole else (row[0] if row else None),
                        "columns": columns,
                        "row": row,
                        "table": table,
                    }
                )
        entries = _by_id(entries)
    else:
        return {
            "parameter": wanted,
            "source": kind or declared.get("type"),
            "hint": "This parameter's options are not a list to browse; "
            "get_visualization_details says what it accepts.",
        }

    # Labels are cheap to scan; the stored value is only returned for what was asked for,
    # because these can be large and only the chosen one is ever written.
    listed = [{"id": e.get("id"), "name": e.get("name") or e.get("label")} for e in entries]
    result = {"parameter": wanted, "source": kind, "total": len(entries), "options": listed[:ROW_CAP]}
    # A case can be declared and still hold nothing on this server: IGV's builtin genomes
    # are a data table an admin may never have filled. Naming its siblings is the difference
    # between a dead end and a second try.
    siblings = [c for c in declared_cases if c != when]
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
            "Call again with `search` to get the value to store for one of these; "
            "the stored value is the whole entry, not its id."
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
            {
                "error": f"No saved visualization {a['visualization_id']!r}.",
                "hint": "Pass the visualization_id that save_visualization returned.",
            },
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
            chosen = value.get(test) if isinstance(value, dict) else None
            inputs = next((c.get("inputs") or [] for c in param.get("cases") or [] if c.get("value") == chosen), [])
            nested = _check_level(value, [param.get("test_param")] + list(inputs), types, f"{param['name']}")
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


async def _save_visualization(g, a):
    dataset, refusal = await _resolve_visualization(g, a)
    if refusal:
        return {"saved": False, **refusal}

    if a.get("settings") or a.get("tracks"):
        plugin = await g.get(f"api/plugins/{a['visualization']}") or {}
        undeclared = _reject_undeclared(plugin, a)
        if undeclared:
            return ToolOutcome(undeclared, is_error=True)

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
                {
                    "saved": False,
                    "error": "Galaxy accepted the visualization but returned no id, so there "
                    "is nothing to display or revise.",
                    "response": created,
                },
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


# api/dynamic_tools is admin-only; a user's own tools live behind api/unprivileged_tools.
async def _list_user_tools(g, a):
    return await g.get(f"api/unprivileged_tools{_q({'active': a.get('active', True)})}")


async def _recommend_biocontainer(g, a):
    """Not a Galaxy call: the registry is quay.io, which the browser can read directly."""
    try:
        return await biocontainers.recommend(a.get("packages") or [])
    except ValueError as e:
        return ToolOutcome({"error": str(e)}, is_error=True)


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
        result["content_hash"] = page_edit.djb2_hash(result.get("content_editor") or result.get("content") or "")
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
    malformed = page_edit.malformed_object_ids(a.get("content") or a.get("section_content") or "")
    if malformed:
        return ToolOutcome(
            {
                "error": (
                    f"These name a Galaxy object by something that is not its encoded id: "
                    f"{', '.join(malformed)}. Galaxy stores that and the embed renders nothing. "
                    "For an artifact you just made, write {{artifact}} where it belongs and the "
                    "directive is built for you; otherwise use the encoded id a tool returned."
                ),
                "page_id": a.get("page_id"),
            },
            is_error=True,
            refused=True,
            guard="malformed-object-id",
        )
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


_tool(
    "update_history",
    "write",
    "Update a history's name, annotation, tags, or deleted/published flags.",
    {
        "history_id": _STR,
        "name": _STR,
        "annotation": _STR,
        "tags": {"type": "array", "items": _STR},
        "deleted": _BOOL,
        "published": _BOOL,
    },
    ["history_id"],
    _update_history,
)
_tool(
    "search_tools_by_keywords",
    "read",
    "Search the Galaxy tool catalog by a list of keywords.",
    {"keywords": {"type": "array", "items": _STR}},
    ["keywords"],
    _search_tools_by_keywords,
)
_tool(
    "get_tool_panel",
    "read",
    "Get the Galaxy tool panel (sections and tools); optional section filter, limit/offset paging.",
    {"section": _STR, "limit": _INT, "offset": _INT},
    [],
    _get_tool_panel,
)
_tool(
    "get_tool_citations",
    "read",
    "Get a tool's citations (bibtex).",
    {"tool_id": _STR},
    ["tool_id"],
    _get_tool_citations,
)
_tool(
    "get_tool_input_template",
    "read",
    "Get a tool's input parameter schema (a fillable template).",
    {"tool_id": _STR},
    ["tool_id"],
    _get_tool_input_template,
)
_tool(
    "get_tool_run_examples",
    "read",
    "Get structural example inputs for a tool.",
    {"tool_id": _STR, "tool_version": _STR},
    ["tool_id"],
    _get_tool_run_examples,
)
_tool(
    "get_collection_details",
    "read",
    "Get a dataset collection's details and elements.",
    {"collection_id": _STR, "max_elements": _INT},
    ["collection_id"],
    _get_collection_details,
)
_tool(
    "download_dataset",
    "read",
    "Save a dataset to the local filesystem and return its path plus a short preview. "
    "The result reports the Galaxy extension and, for a tabular format, the delimiter "
    "Galaxy parsed it with: pass that as sep rather than assuming one. "
    "A dataset over 20 MB comes back as a line-aligned prefix with partial=true and "
    "bytes_total set; never compute totals or counts from a partial read. "
    "Read the file with run_python; do not paste the preview into code.",
    {"dataset_id": _STR},
    ["dataset_id"],
    _download_dataset,
)
_tool(
    "upload_file_from_url",
    "write",
    "Upload a dataset into a history from a URL.",
    {"url": _STR, "history_id": _STR, "file_type": _STR, "dbkey": _STR, "file_name": _STR},
    ["url"],
    _upload_file_from_url,
)
_tool(
    "upload_file",
    "write",
    "Upload a file from the local filesystem to a history -- e.g. one written by run_python.",
    {"path": _STR, "history_id": _STR, "file_name": _STR, "file_type": _STR, "dbkey": _STR},
    ["path"],
    _upload_file,
)
_tool(
    "list_workflows",
    "read",
    "List stored workflows; optional name/tag/id filter, published flag, " "limit/offset paging.",
    {
        "workflow_id": _STR,
        "name": _STR,
        "published": _BOOL,
        "limit": {"type": "integer", "description": "Rows per page; the reply names next_offset when more remain."},
        "offset": {"type": "integer", "description": "Rows to skip, from a previous reply's next_offset."},
    },
    [],
    _list_workflows,
)
_tool(
    "get_workflow_details",
    "read",
    "Get a stored workflow's details.",
    {"workflow_id": _STR, "version": _INT},
    ["workflow_id"],
    _get_workflow_details,
)
_tool(
    "get_workflow_input_template",
    "read",
    "Get a workflow's run-form input template (fill and pass to invoke_workflow).",
    {"workflow_id": _STR, "history_id": _STR},
    ["workflow_id"],
    _get_workflow_input_template,
)
_tool(
    "invoke_workflow",
    "write",
    "Run a workflow. inputs maps input steps to datasets ({id, src}); "
    "give history_id or history_name for the output history.",
    {
        "workflow_id": _STR,
        "inputs": {"type": "object"},
        "params": {"type": "object"},
        "history_id": _STR,
        "history_name": _STR,
        "inputs_by": _STR,
        "parameters_normalized": _BOOL,
    },
    ["workflow_id"],
    _invoke_workflow,
)
_tool(
    "cancel_workflow_invocation",
    "write",
    "Cancel a running workflow invocation.",
    {"invocation_id": _STR},
    ["invocation_id"],
    _cancel_workflow_invocation,
)
_tool(
    "get_invocations",
    "read",
    "List workflow invocations, or one by id. Each carries an "
    "`outcome` rolled up from its jobs: Galaxy's own `state` describes scheduling, so a run "
    "whose jobs failed still reads `completed` there. Judge a run by `outcome`.",
    {
        "invocation_id": _STR,
        "workflow_id": _STR,
        "history_id": _STR,
        "limit": _INT,
        "view": _STR,
        "step_details": _BOOL,
    },
    [],
    _get_invocations,
)
_tool(
    "list_user_tools", "read", "List the user's dynamic (user-defined) tools.", {"active": _BOOL}, [], _list_user_tools
)
_tool(
    "create_user_tool",
    "write",
    "Create a dynamic (user-defined) tool from a representation.",
    {"representation": {"type": "object"}},
    ["representation"],
    _create_user_tool,
)
_tool(
    "recommend_biocontainer",
    "read",
    DOCS["recommend_biocontainer"],
    {"packages": {"type": "array", "items": {"type": "string"}}},
    ["packages"],
    _recommend_biocontainer,
)
_tool("delete_user_tool", "write", "Delete a dynamic tool by uuid.", {"uuid": _STR}, ["uuid"], _delete_user_tool)
_tool(
    "run_user_tool",
    "write",
    "Run a dynamic (user-defined) tool by uuid in a history.",
    {"history_id": _STR, "tool_uuid": _STR, "inputs": {"type": "object"}},
    ["history_id", "tool_uuid", "inputs"],
    _run_user_tool,
)
_tool(
    "get_visualization_options",
    "read",
    "Resolve a visualization parameter's selectable options from wherever the plugin says "
    "they live. Use `search` to get the value to store.",
    {"visualization": _STR, "parameter": _STR, "search": _STR, "when": _STR},
    ["visualization", "parameter"],
    _get_visualization_options,
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
    "list_visualizations",
    "read",
    "List the Galaxy visualizations that can display a dataset.",
    {"dataset_id": _STR},
    ["dataset_id"],
    _list_visualizations,
)
_tool(
    "list_pages",
    "read",
    "List pages (Galaxy markdown documents; a history-attached page is a Notebook).",
    {"history_id": _STR, "search": _STR, "limit": _INT, "offset": _INT, "show_published": _BOOL, "show_shared": _BOOL},
    [],
    _list_pages,
)
_tool(
    "get_page",
    "read",
    "Get a page's editable content and metadata.",
    {"page_id": _STR, "include_rendered": _BOOL},
    ["page_id"],
    _get_page,
)
_tool(
    "create_page",
    "write",
    "Create a page (Notebook if history_id given, else a standalone Report).",
    {"history_id": _STR, "title": _STR, "content": _STR, "annotation": _STR, "slug": _STR},
    [],
    _create_page,
)
_tool(
    "update_page",
    "write",
    "Update a page. Give `section_heading` and `section_content` to replace one section, "
    "or `content` to replace the body. Pass `expect_hash` from when you read the page and "
    "the write is refused if someone edited it since.",
    {
        "page_id": _STR,
        "content": _STR,
        "title": _STR,
        "section_heading": {"type": "string", "description": "The exact heading line of the section to replace."},
        "section_content": {"type": "string", "description": "The section's new text, heading line included."},
        "expect_hash": {
            "type": "string",
            "description": "content_hash from when the page was read; the write is refused if it changed.",
        },
    },
    ["page_id"],
    _update_page,
)
_tool(
    "list_page_revisions",
    "read",
    "List a page's edit revisions.",
    {"page_id": _STR, "sort_desc": _BOOL},
    ["page_id"],
    _list_page_revisions,
)
_tool(
    "get_page_revision",
    "read",
    "Get one page revision.",
    {"page_id": _STR, "revision_id": _STR},
    ["page_id", "revision_id"],
    _get_page_revision,
)
_tool(
    "revert_page_revision",
    "write",
    "Revert a page to an earlier revision.",
    {"page_id": _STR, "revision_id": _STR},
    ["page_id", "revision_id"],
    _revert_page_revision,
)


# --- niche tier: IWC (external GitHub manifest, not the Galaxy API) -----------

_IWC_MANIFEST_URL = "https://iwc.galaxyproject.org/workflow_manifest.json"
_iwc_cache = {}


async def _iwc_manifest(g):
    g.manifest.require("read")
    if "workflows" not in _iwc_cache:
        # The manifest is a list of collections; flatten to their workflows.
        raw = await http.request("GET", _IWC_MANIFEST_URL) or []
        workflows = []
        for collection in raw:
            workflows.extend(collection.get("workflows", []))
        _iwc_cache["workflows"] = workflows
    return _iwc_cache["workflows"]


README_SUMMARY_CHARS = 300


def _tool_name(tool_id):
    """The name inside a toolshed id, which is what a user recognises."""
    parts = tool_id.split("/")
    return parts[-2] if len(parts) > 2 else tool_id


def _iwc_tools(definition):
    names = []
    for step in (definition.get("steps") or {}).values():
        tool_id = step.get("tool_id") if isinstance(step, dict) else None
        name = _tool_name(tool_id) if tool_id else None
        if name and name not in names:
            names.append(name)
    return names


def _iwc_entry(w):
    d = w.get("definition", {})
    return {
        "trsID": w.get("trsID", ""),
        "name": d.get("name", ""),
        "description": d.get("annotation", ""),
        "tags": d.get("tags", []),
        "categories": w.get("categories", []),
        "readme_summary": (w.get("readme") or "")[:README_SUMMARY_CHARS],
        "step_count": len(d.get("steps") or {}),
        "authors": w.get("authors") or [],
        "tools_used": _iwc_tools(d),
    }


async def _get_iwc_workflows(g, a):
    return [_iwc_entry(w) for w in await _iwc_manifest(g)]


def _iwc_text(entry):
    """The words an entry itself carries, which is what the description says it matches."""
    values = [entry["trsID"], entry["name"], entry["description"], entry["readme_summary"]]
    values += entry["tags"] + entry["categories"]
    return " ".join(str(v) for v in values).lower()


async def _search_iwc_workflows(g, a):
    needle = (a.get("query") or "").lower()
    entries = [_iwc_entry(w) for w in await _iwc_manifest(g)]
    return [e for e in entries if needle in _iwc_text(e)]


async def _recommend_iwc_workflows(g, a):
    hits = await _search_iwc_workflows(g, {"query": a.get("intent", "")})
    return hits[: a.get("limit", 5)]


async def _get_iwc_workflow_details(g, a):
    for w in await _iwc_manifest(g):
        if w.get("trsID") == a["trs_id"]:
            return w
    return ToolOutcome({"error": "trs_id not found in IWC manifest", "trs_id": a["trs_id"]}, is_error=True)


async def _import_workflow_from_iwc(g, a):
    details = await _get_iwc_workflow_details(g, {"trs_id": a["trs_id"]})
    if "error" in details:
        return details
    return await g.post("api/workflows", {"workflow": details.get("definition")})


_tool(
    "get_iwc_workflows",
    "read",
    "List curated Interactive Workflow Composer (IWC) workflows.",
    {},
    [],
    _get_iwc_workflows,
)
_tool(
    "search_iwc_workflows", "read", "Search IWC workflows by text.", {"query": _STR}, ["query"], _search_iwc_workflows
)
_tool(
    "recommend_iwc_workflows",
    "read",
    "Recommend IWC workflows for a described intent.",
    {"intent": _STR, "limit": _INT},
    ["intent"],
    _recommend_iwc_workflows,
)
_tool(
    "get_iwc_workflow_details",
    "read",
    "Get a single IWC workflow by TRS id.",
    {"trs_id": _STR},
    ["trs_id"],
    _get_iwc_workflow_details,
)
_tool(
    "import_workflow_from_iwc",
    "write",
    "Import an IWC workflow into Galaxy by TRS id.",
    {"trs_id": _STR},
    ["trs_id"],
    _import_workflow_from_iwc,
)


def tool_schemas(manifest):
    """Advertised tool schemas, filtered to the capabilities the manifest grants."""
    return [t["schema"] for t in TOOLS if manifest.allows(t["capability"])]


def declared(name):
    """One tool's declaration, whether or not a manifest would advertise it."""
    return next((t for t in TOOLS if t["name"] == name), None)


def get_handler(name):
    return HANDLERS.get(name)
