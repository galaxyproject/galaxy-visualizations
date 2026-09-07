"""Orbit-compatible named Galaxy tools, cloned from galaxy-mcp."""

import json
import os
import sys
import tempfile
from urllib.parse import urlencode

from .galaxy_tool_docs import DOCS

TOOLS = []

# Pyodide's MEMFS is olite's equivalent of the filesystem Orbit has on disk.
# Datasets land here so run_python can read them as files.
# Pyodide's MEMFS allows a directory at the root; a host filesystem does not.
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
    params = {"limit": a.get("limit"), "offset": a.get("offset", 0)}
    if a.get("name"):
        params["q"] = "name-contains"
        params["qv"] = a["name"]
    return await g.get(f"api/histories{_q(params)}")


async def _list_history_ids(g, a):
    histories = await g.get("api/histories?keys=id,name") or []
    return [{"id": h.get("id"), "name": h.get("name")} for h in histories]


async def _get_history_details(g, a):
    return await g.get(f"api/histories/{a['history_id']}")


async def _get_history_contents(g, a):
    params = {
        "limit": a.get("limit", 100),
        "offset": a.get("offset", 0),
        "deleted": a.get("deleted", False),
        "visible": a.get("visible", True),
        "order": a.get("order", "hid-asc"),
    }
    return await g.get(f"api/histories/{a['history_id']}/contents{_q(params)}")


async def _create_history(g, a):
    return await g.post("api/histories", {"name": a["history_name"]})


async def _run_tool(g, a):
    return await g.post(
        "api/tools",
        {"history_id": a["history_id"], "tool_id": a["tool_id"], "inputs": a.get("inputs") or {}},
    )


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
            # A chunk, not the whole file: /display streams everything, so previewing a
            # large dataset would pull it all into memory to show ten lines.
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


async def _get_tool_panel(g, a):
    return await g.get("api/tools?in_panel=true")


async def _get_tool_citations(g, a):
    return await g.get(f"api/tools/{a['tool_id']}/citations")


async def _get_tool_input_template(g, a):
    # The parameter request schema is the modern, machine-usable input template.
    return await g.get(f"api/tools/{a['tool_id']}/parameter_request_schema")


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
    # Written to the filesystem as bytes: inline content breaks tool-call JSON, and
    # decoding as text corrupts BAM/HDF5/gzip.
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
    # The counterpart to download_dataset: read back from the Pyodide filesystem so a
    # file produced by run_python can be sent to Galaxy. Uploaded as pasted content,
    # since a browser cannot hand Galaxy a path on disk.
    path = a["path"]
    if not os.path.isfile(path):
        return {"error": f"No such file: {path}", "path": path}
    with open(path, "rb") as f:
        raw = f.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        # Galaxy's fetch API takes pasted content as text (data_fetch.py uses StringIO),
        # so binary would have to go up as multipart. Refuse rather than corrupt it.
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


async def _list_workflows(g, a):
    params = {"show_published": a.get("published", False)}
    workflows = await g.get(f"api/workflows{_q(params)}") or []
    if a.get("name"):
        needle = a["name"].lower()
        workflows = [w for w in workflows if needle in (w.get("name") or "").lower()]
    if a.get("workflow_id"):
        workflows = [w for w in workflows if w.get("id") == a["workflow_id"]]
    return workflows


async def _get_workflow_details(g, a):
    return await g.get(f"api/workflows/{a['workflow_id']}{_q({'version': a.get('version')})}")


async def _get_workflow_input_template(g, a):
    # style=run is the webapp's own run-form model; good enough as a template.
    params = {"style": "run", "instance": "false", "history_id": a.get("history_id")}
    return await g.get(f"api/workflows/{a['workflow_id']}/download{_q(params)}")


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
    return await g.delete(f"api/invocations/{a['invocation_id']}")


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


async def _list_user_tools(g, a):
    return await g.get(f"api/dynamic_tools{_q({'active': a.get('active', True)})}")


async def _create_user_tool(g, a):
    return await g.post("api/dynamic_tools", a["representation"])


async def _delete_user_tool(g, a):
    return await g.delete(f"api/dynamic_tools/{a['uuid']}")


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
    page = await g.get(f"api/pages/{a['page_id']}") or {}
    if not a.get("include_rendered") and isinstance(page, dict):
        page = dict(page)
        page.pop("content", None)
    return page


async def _create_page(g, a):
    payload = {k: a[k] for k in ("title", "content", "annotation", "slug") if a.get(k) is not None}
    if a.get("history_id"):
        payload["history_id"] = a["history_id"]
    return await g.post("api/pages", payload)


async def _update_page(g, a):
    payload = {k: a[k] for k in ("title", "content") if a.get(k) is not None}
    return await g.put(f"api/pages/{a['page_id']}", payload)


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
_tool("get_tool_panel", "read", "Get the Galaxy tool panel (sections and tools).", {}, [], _get_tool_panel)
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
_tool("list_workflows", "read", "List stored workflows; optional name/id filter, published flag.",
      {"workflow_id": _STR, "name": _STR, "published": _BOOL}, [], _list_workflows)
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
_tool("list_pages", "read", "List pages (Galaxy markdown documents; a history-attached page is a Notebook).",
      {"history_id": _STR, "search": _STR, "limit": _INT, "offset": _INT, "show_published": _BOOL, "show_shared": _BOOL},
      [], _list_pages)
_tool("get_page", "read", "Get a page's editable content and metadata.",
      {"page_id": _STR, "include_rendered": _BOOL}, ["page_id"], _get_page)
_tool("create_page", "write", "Create a page (Notebook if history_id given, else a standalone Report).",
      {"history_id": _STR, "title": _STR, "content": _STR, "annotation": _STR, "slug": _STR}, [], _create_page)
_tool("update_page", "write", "Update a page's content and/or title.",
      {"page_id": _STR, "content": _STR, "title": _STR}, ["page_id"], _update_page)
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
