"""Orbit-compatible named Galaxy tools, cloned from galaxy-mcp."""

import json
import logging
import os
import tempfile

from olit.substrate.browser import in_browser

from . import biocontainers, invocation_outcome, page_edit, visualizations
from .galaxy_tool_docs import DOCS
from .outcome import ToolOutcome
from .paging import server_page
from .registry import (
    _BOOL,
    _INT,
    _STR,
    HANDLERS,
    TOOLS,
    _q,
    _tool,
    declared,
    get_handler,
    tool_schemas,
)

logger = logging.getLogger(__name__)

# Re-exported so callers keep one way in to the tool surface.
__all__ = ["HANDLERS", "TOOLS", "declared", "get_handler", "tool_schemas"]

# Pyodide's MEMFS is olit's equivalent of the filesystem Orbit has on disk.
DATA_DIR = "/data" if in_browser() else os.path.join(tempfile.gettempdir(), "olit-data")
# Enough to show the header and shape of a table without a run_python round trip.
PREVIEW_LINES = 50
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024
# The log fields Galaxy adds to a job under `full=true`.
JOB_LOG_FIELDS = (
    "tool_stdout",
    "tool_stderr",
    "job_stdout",
    "job_stderr",
    "stdout",
    "stderr",
)
JOB_LOG_BYTES = 4 * 1024


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
    # Both arguments widen what is listed, so each one filters only while it is not asked for.
    wanted = [("deleted", "False")] if not a.get("deleted", False) else []
    wanted += [("visible", "True")] if a.get("visible", True) else []
    params = {
        "limit": limit + 1,
        "offset": offset,
        "order": a.get("order", "hid-asc"),
        # Galaxy honours `order` only alongside v=dev; without it the parameter is ignored
        # outright, so the sort the description offers did nothing. Same item shape either way.
        "v": "dev",
        # This endpoint filters through q/qv; a plain `deleted` or `visible` is ignored.
        "q": [field for field, _ in wanted],
        "qv": [value for _, value in wanted],
    }
    items = await g.get(f"api/histories/{a['history_id']}/contents{_q(params)}")
    if not isinstance(items, list):
        return items
    return server_page([_one_identifier(i) for i in items], offset, limit)


# Sources a history owns, and where each one answers its history_id. A library dataset is
# scoped to a library rather than a history, so it is legitimately usable from any of them.
HISTORY_SCOPED_SRCS = {"hda": "api/datasets", "hdca": "api/dataset_collections"}


def _hda_inputs(inputs):
    """Every history-scoped reference in a tool payload, with the field that carries it."""
    found = []

    def walk(name, value):
        if isinstance(value, dict):
            if value.get("src") in HISTORY_SCOPED_SRCS and value.get("id"):
                found.append((name, value["id"], value["src"]))
                return
            for key, item in value.items():
                walk(f"{name}.{key}" if name else key, item)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                walk(f"{name}[{index}]", item)

    walk("", inputs or {})
    return found


async def _foreign_inputs(g, inputs, history_id):
    """Inputs that belong to a history other than the one the job will run in."""
    foreign = []
    for name, object_id, src in _hda_inputs(inputs):
        detail = await g.get(f"{HISTORY_SCOPED_SRCS[src]}/{object_id}") or {}
        where = detail.get("history_id") if isinstance(detail, dict) else None
        if where and where != history_id:
            foreign.append(
                {
                    "input": name,
                    "supplied_id": object_id,
                    "resolves_to_history_id": where,
                    "resolves_to_name": detail.get("name"),
                }
            )
    return foreign


class ToolParameterError(Exception):
    """A rejected parameter. The dispatcher attaches the template: building it is an operation
    galaxy-ops owns, and a handler is only handed the Galaxy client."""


def parameter_help(detail, template):
    """What the model is told when a tool rejects its inputs."""
    if not template:
        return detail
    return (
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


async def _run_tool(g, a):
    history_id = a["history_id"]
    inputs = a.get("inputs") or {}
    foreign = await _foreign_inputs(g, inputs, history_id)
    if foreign:
        return ToolOutcome(
            f"Refused: these inputs do not identify a dataset in history {history_id}: "
            f"{json.dumps(foreign, default=str)}. Use the `id` field of a dataset returned by "
            f"get_history_contents for this history. To use data from elsewhere, copy it into "
            f"this history first.",
            is_error=True,
        )
    try:
        return await g.post(
            "api/tools",
            {"history_id": history_id, "tool_id": a["tool_id"], "inputs": inputs},
        )
    except Exception as exc:
        if not _is_parameter_error(exc):
            raise
        # Galaxy names the offending key but not the shape it wanted.
        raise ToolParameterError(str(exc)) from exc


# Lookups over data Galaxy holds still for a session: the same question returns the same answer.
SETTLED = frozenset(
    {
        "search_tools_by_name",
        "search_tools_by_keywords",
        "get_visualization_details",
    }
)


# Why a Galaxy operation galaxy-ops also implements is still run here. Every other shared
# operation is declared with no handler, and galaxy-ops runs it.
KEPT_LOCAL = {
    "run_tool": "galaxy-ops runs a tool through /api/tool_requests and blocks until the jobs "
    "settle; olit submits to /api/tools and lets the loop watch, and adds the target-history "
    "input guard and the input template a parameter error earns.",
    "upload_file_from_url": "galaxy-ops uploads through the legacy upload1 form; olit uses "
    "/api/tools/fetch with auto_decompress, which is what lands the datatype Galaxy sniffs.",
    "get_history_contents": "olit drops the underlying `dataset_id` beside the HDA id, which "
    "encodes identically and silently addresses another object, and bounds the page by bytes.",
    "get_page": "paired with update_page: olit hashes the body so an edit can say what it "
    "expected, and withholds the rendered content until it is asked for.",
    "update_page": "olit edits one section against a hash, and refuses content naming a Galaxy "
    "object by anything but its encoded id.",
    "get_invocations": "olit settles an invocation against its job states, because Galaxy "
    "reports `completed` for a run whose jobs errored.",
    "get_job_details": "olit asks for `full` and tails the logs, which is how a failed job is "
    "diagnosed; neither galaxy-ops nor the MCP server returns them.",
}


# Top-level fields of `data` that a description tells the model to read. Declared here rather
# than in a test because it is a fact about the contract: the parity guard reads it back off a
# live result, and `describe` publishes it so an upstream drift check can see what is covered.
# The basis is the result galaxy-mcp documents, whose descriptions olit serves verbatim; the
# parity guard reads each one back off a live result. Two of these were wrong when checked --
# a collection arrived without `collection` or `note`, and test examples without
# `requested_version` -- so the class of defect is not hypothetical.
PROMISED_FIELDS = {
    "get_tool_panel": ("tool_count", "section_count"),
    "get_tool_citations": ("tool_name", "tool_version", "citations"),
    "get_tool_input_template": ("tool_id", "inputs_template", "parameters"),
    "get_tool_run_examples": ("tool_id", "requested_version", "test_cases"),
    "get_history_details": ("history", "contents_summary"),
    "get_collection_details": (
        "collection_id",
        "collection",
        "elements",
        "elements_truncated",
        "note",
    ),
    "get_workflow_input_template": ("inputs_template", "guide", "warnings"),
}


def promised_fields(name):
    return PROMISED_FIELDS.get(name, ())


def delegated_to_ops(name):
    """The capability this operation needs when galaxy-ops runs it, or None to run it here.

    A declaration with no handler has no other way to run, so the two cannot disagree.
    """
    declaration = declared(name)
    if declaration is None or declaration["handler"] is not None:
        return None
    return declaration["capability"]


def settled(name):
    """Whether repeating this call with the same arguments can produce anything new."""
    return name in SETTLED


# The tool catalog does not hold visualizations, so a search that came back empty may still
# have named one. Policy rather than operation: it holds whoever ran the search.
CATALOG_SEARCHES = frozenset({"search_tools_by_name", "search_tools_by_keywords"})


async def catalog_miss_hint(g, name, args, data):
    """Where the thing this search did not find actually lives, or None."""
    if name not in CATALOG_SEARCHES or data:
        return None
    query = args.get("query") or " ".join(args.get("keywords") or [])
    plugin = await visualizations.a_visualization_named(g, query)
    if not plugin:
        return None
    return (
        f"[olit] {plugin!r} is a visualization, which the tool catalog does not hold. "
        "list_visualizations names the ones that can render a given dataset."
    )


async def _get_job_details(g, a):
    dataset = await g.get(f"api/datasets/{a['dataset_id']}") or {}
    job_id = dataset.get("creating_job")
    if not job_id:
        return ToolOutcome(f"No creating job for dataset {a['dataset_id']}.", is_error=True)
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


_tool(
    "get_server_info",
    "read",
    "Get the connected Galaxy server's version and configuration.",
    {},
    [],
    None,
)
_tool("get_user", "read", "Get the current authenticated Galaxy user.", {}, [], None)
_tool(
    "get_histories",
    "read",
    "List the user's histories. Optional name filter; supports limit/offset paging.",
    {
        "limit": {
            "type": "integer",
            "description": "Rows per page; the reply names next_offset when more remain.",
        },
        "offset": {
            "type": "integer",
            "description": "Rows to skip, from a previous reply's next_offset.",
        },
        "name": _STR,
    },
    [],
    None,
)
_tool(
    "list_history_ids",
    "read",
    "List just the id and name of each of the user's histories.",
    {},
    [],
    None,
)
_tool(
    "get_history_details",
    "read",
    "Get full details of one history by id.",
    {"history_id": _STR},
    ["history_id"],
    None,
)
_tool(
    "get_history_contents",
    "read",
    "List datasets and collections in a history (hid-ordered; paged).",
    {
        "history_id": _STR,
        "limit": {
            "type": "integer",
            "description": "Rows per page; the reply names next_offset when more remain.",
        },
        "offset": {
            "type": "integer",
            "description": "Rows to skip, from a previous reply's next_offset.",
        },
        "deleted": _BOOL,
        "visible": _BOOL,
        "order": _STR,
    },
    ["history_id"],
    _get_history_contents,
)
_tool(
    "create_history",
    "write",
    "Create a new history.",
    {"history_name": _STR},
    ["history_name"],
    None,
)
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
    None,
)
_tool(
    "get_tool_details",
    "read",
    "Get a Galaxy tool's details by tool_id; set io_details for its input/output schema.",
    {"tool_id": _STR, "io_details": _BOOL},
    ["tool_id"],
    None,
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
    None,
)


# --- extended tier: tools, datasets, workflows, pages, user tools ------------


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
            f"Dataset is in state {state!r}, not 'ok', so it holds nothing to read yet. "
            "Wait for the job producing it to finish and download it again.",
            is_error=True,
        )
    stated = details.get("file_size") if isinstance(details, dict) else None
    partial = False
    if isinstance(stated, int) and stated > MAX_DOWNLOAD_BYTES:
        # Galaxy's chunked display: line-aligned, and it refuses binary itself.
        chunk = await _chunk(g, a["dataset_id"], MAX_DOWNLOAD_BYTES)
        if chunk is None:
            return ToolOutcome(
                f"Dataset is {stated / 1e6:.1f} MB and cannot be read in chunks. " "Run a Galaxy tool on it instead.",
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
        for key, field in (
            ("extension", "extension"),
            ("delimiter", "metadata_delimiter"),
        ):
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
        return ToolOutcome(f"No such file: {path}", is_error=True)
    with open(path, "rb") as f:
        raw = f.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        # Pasted content goes up as text, so binary is refused.
        return ToolOutcome(
            "Cannot upload binary content: Galaxy accepts pasted uploads as text only. "
            "Use upload_file_from_url for binary data.",
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


# A stored value can be a whole entry, so only the ones actually searched for are returned.


# Chrome-free: Galaxy drops the masthead inside any iframe, hide_panels drops the rest.


# api/dynamic_tools is admin-only; a user's own tools live behind api/unprivileged_tools.
async def _recommend_biocontainer(g, a):
    """Not a Galaxy call: the registry is quay.io, which the browser can read directly."""
    try:
        return await biocontainers.recommend(a.get("packages") or [])
    except ValueError as e:
        return ToolOutcome(str(e), is_error=True)


async def _get_page(g, a):
    result = await g.get(f"api/pages/{a['page_id']}") or {}
    if isinstance(result, dict):
        result = dict(result)
        result["content_hash"] = page_edit.djb2_hash(result.get("content_editor") or result.get("content") or "")
        if not a.get("include_rendered"):
            result.pop("content", None)
    return result


async def _update_page(g, a):
    malformed = page_edit.malformed_object_ids(a.get("content") or a.get("section_content") or "")
    if malformed:
        return ToolOutcome(
            f"These name a Galaxy object by something that is not its encoded id: "
            f"{', '.join(malformed)}. Galaxy stores that and the embed renders nothing. "
            "For an artifact you just made, write {{artifact}} where it belongs and the "
            "directive is built for you; otherwise use the encoded id a tool returned.",
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
    None,
)
_tool(
    "search_tools_by_keywords",
    "read",
    "Search the Galaxy tool catalog by a list of keywords.",
    {"keywords": {"type": "array", "items": _STR}},
    ["keywords"],
    None,
)
_tool(
    "get_tool_panel",
    "read",
    "Get the Galaxy tool panel (sections and tools); optional section filter, limit/offset paging.",
    {"section_id": _STR, "limit": _INT, "offset": _INT},
    [],
    None,
)
_tool(
    "get_tool_citations",
    "read",
    "Get a tool's citations (bibtex).",
    {"tool_id": _STR},
    ["tool_id"],
    None,
)
_tool(
    "get_tool_input_template",
    "read",
    "Get a tool's input parameter schema (a fillable template).",
    {"tool_id": _STR},
    ["tool_id"],
    None,
)
_tool(
    "get_tool_run_examples",
    "read",
    "Get structural example inputs for a tool.",
    {"tool_id": _STR, "tool_version": _STR},
    ["tool_id"],
    None,
)
_tool(
    "get_collection_details",
    "read",
    "Get a dataset collection's details and elements.",
    {"collection_id": _STR, "max_elements": _INT},
    ["collection_id"],
    None,
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
    {
        "url": _STR,
        "history_id": _STR,
        "file_type": _STR,
        "dbkey": _STR,
        "file_name": _STR,
    },
    ["url"],
    _upload_file_from_url,
)
_tool(
    "upload_file",
    "write",
    "Upload a file from the local filesystem to a history -- e.g. one written by run_python.",
    {
        "path": _STR,
        "history_id": _STR,
        "file_name": _STR,
        "file_type": _STR,
        "dbkey": _STR,
    },
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
        "limit": {
            "type": "integer",
            "description": "Rows per page; the reply names next_offset when more remain.",
        },
        "offset": {
            "type": "integer",
            "description": "Rows to skip, from a previous reply's next_offset.",
        },
    },
    [],
    None,
)
_tool(
    "get_workflow_details",
    "read",
    "Get a stored workflow's details.",
    {"workflow_id": _STR, "version": _INT},
    ["workflow_id"],
    None,
)
_tool(
    "get_workflow_input_template",
    "read",
    "Get a workflow's run-form input template (fill and pass to invoke_workflow).",
    {"workflow_id": _STR, "history_id": _STR, "verbose": _BOOL},
    ["workflow_id"],
    None,
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
    None,
)
_tool(
    "cancel_workflow_invocation",
    "write",
    "Cancel a running workflow invocation.",
    {"invocation_id": _STR},
    ["invocation_id"],
    None,
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
    "list_user_tools",
    "read",
    "List the user's dynamic (user-defined) tools.",
    {"active": _BOOL},
    [],
    None,
)
_tool(
    "create_user_tool",
    "write",
    "Create a dynamic (user-defined) tool from a representation.",
    {"representation": {"type": "object"}},
    ["representation"],
    None,
)
_tool(
    "recommend_biocontainer",
    "read",
    DOCS["recommend_biocontainer"],
    {"packages": {"type": "array", "items": {"type": "string"}}},
    ["packages"],
    _recommend_biocontainer,
)
_tool(
    "delete_user_tool",
    "write",
    "Delete a dynamic tool by uuid.",
    {"uuid": _STR},
    ["uuid"],
    None,
)
_tool(
    "run_user_tool",
    "write",
    "Run a dynamic (user-defined) tool by uuid in a history.",
    {"history_id": _STR, "tool_uuid": _STR, "inputs": {"type": "object"}},
    ["history_id", "tool_uuid", "inputs"],
    None,
)
visualizations.register()
_tool(
    "list_pages",
    "read",
    "List pages (Galaxy markdown documents; a history-attached page is a Notebook).",
    {
        "history_id": _STR,
        "search": _STR,
        "limit": _INT,
        "offset": _INT,
        "show_published": _BOOL,
        "show_shared": _BOOL,
    },
    [],
    None,
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
    {
        "history_id": _STR,
        "title": _STR,
        "content": _STR,
        "annotation": _STR,
        "slug": _STR,
    },
    [],
    None,
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
        "section_heading": {
            "type": "string",
            "description": "The exact heading line of the section to replace.",
        },
        "section_content": {
            "type": "string",
            "description": "The section's new text, heading line included.",
        },
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
    None,
)
_tool(
    "get_page_revision",
    "read",
    "Get one page revision.",
    {"page_id": _STR, "revision_id": _STR},
    ["page_id", "revision_id"],
    None,
)
_tool(
    "revert_page_revision",
    "write",
    "Revert a page to an earlier revision.",
    {"page_id": _STR, "revision_id": _STR},
    ["page_id", "revision_id"],
    None,
)


# --- niche tier: IWC (external GitHub manifest, not the Galaxy API) -----------

_tool(
    "get_iwc_workflows",
    "read",
    "List curated Interactive Workflow Composer (IWC) workflows.",
    {"limit": _INT, "offset": _INT},
    [],
    None,
)
_tool(
    "search_iwc_workflows",
    "read",
    "Search IWC workflows by text.",
    {"query": _STR},
    ["query"],
    None,
)
_tool(
    "recommend_iwc_workflows",
    "read",
    "Recommend IWC workflows for a described intent.",
    {"intent": _STR, "limit": _INT},
    ["intent"],
    None,
)
_tool(
    "get_iwc_workflow_details",
    "read",
    "Get a single IWC workflow by TRS id.",
    {"trs_id": _STR},
    ["trs_id"],
    None,
)
_tool(
    "import_workflow_from_iwc",
    "write",
    "Import an IWC workflow into Galaxy by TRS id.",
    {"trs_id": _STR},
    ["trs_id"],
    None,
)
