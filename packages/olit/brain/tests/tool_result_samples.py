"""Real tool results, dispatched through the real surface, for both sides of the boundary.

The shell reads this content structurally: it learns which jobs to watch, which history the
agent ended up in and which page the record lives on. Nothing else in either suite crosses
that boundary, so both sides built their own fixture and each agreed with itself while the
envelope changed under one of them. One producer, two consumers.

Run as a script to print `{tool name: content}` as JSON, which is what the vitest side reads.
"""

import asyncio
import json
import pathlib
import sys

if __name__ == "__main__":  # pragma: no cover - the script form the shell's suite calls
    here = pathlib.Path(__file__).resolve().parent
    sys.path[:0] = [str(here.parent), str(here)]

from olit.loop.tools import ToolSurface

# What Galaxy answers each route with, trimmed to the fields a reader looks for.
RUN_TOOL = {
    "outputs": [{"id": "d1", "hid": 1, "state": "new", "history_id": "h1"}],
    "jobs": [{"id": "j1", "state": "new"}],
    "implicit_collections": [],
}
FETCH = {
    "outputs": [{"id": "d2", "hid": 2, "state": "queued", "history_id": "h1"}],
    "jobs": [{"id": "j2", "state": "new"}],
}
CONTENTS = [{"id": "d1", "hid": 1, "history_id": "h1", "name": "reads.fastq", "state": "ok"}]
HISTORY = {"model_class": "History", "id": "h-new", "name": "GTN tutorial"}
INVOCATION = {"id": "i1", "state": "new", "history_id": "h-inv", "workflow_id": "w1"}
PAGE = {"id": "p9", "slug": "olit-h1", "title": "Olit Notebook", "content": "# Record"}

# An upload whose source url failed: the result still names datasets to watch, and a hint
# paragraph follows the JSON, so the payload is not the whole string.
FAILED_FETCH = {
    "outputs": [
        {"id": "d3", "hid": 3, "state": "error", "history_id": "h1", "misc_info": "Failed to fetch url ftp://sra-pub/x"}
    ],
    "jobs": [{"id": "j3", "state": "error"}],
}


class _Galaxy:
    """Galaxy as the local handlers reach it."""

    def __init__(self, upload=FETCH):
        self._upload = upload

    def scoped(self, manifest):
        return self

    async def get(self, path, binary=False):
        if "contents" in path:
            return CONTENTS
        if path.startswith("api/pages/"):
            return PAGE
        if path == "api/pages":
            return [PAGE]
        return {}

    async def post(self, path, body=None):
        if path == "api/tools":
            return RUN_TOOL
        if path.startswith("api/tools/fetch"):
            return self._upload
        if path == "api/pages":
            return PAGE
        return {}

    async def put(self, path, body=None):
        return PAGE


def _ops(name, args):
    return {"create_history": HISTORY, "invoke_workflow": INVOCATION}.get(name, {})


# Each entry is one tool the shell reads structurally, with the smallest arguments it takes.
CALLS = [
    ("run_tool", {"history_id": "h1", "tool_id": "cat1", "inputs": {}}, FETCH),
    ("upload_file_from_url", {"history_id": "h1", "url": "http://example.invalid/r.fastq"}, FETCH),
    ("upload_file_from_url_failed_fetch", {"history_id": "h1", "url": "ftp://sra-pub/x"}, FAILED_FETCH),
    ("invoke_workflow", {"workflow_id": "w1", "history_id": "h-inv"}, FETCH),
    ("create_history", {"history_name": "GTN tutorial"}, FETCH),
    ("get_history_contents", {"history_id": "h1"}, FETCH),
    ("notebook_resume", {}, FETCH),
]


async def _produce():
    try:
        from .fakes import FakeOps, FakeSubstrate
    except ImportError:  # the script form, where `tests` is a directory on the path
        from fakes import FakeOps, FakeSubstrate

    out = {}
    for label, args, upload in CALLS:
        name = label.split("_failed_fetch")[0]
        substrate = FakeSubstrate(
            galaxy=_Galaxy(upload), ops=FakeOps(_ops), capabilities=("llm", "local", "read", "write")
        )
        surface = ToolSurface(substrate, None, None, None, None, {"session_id": "s1", "page_id": None})
        out[label] = (await surface.dispatch(name, args, "c1")).text
    return out


def produce():
    """`{label: the exact string the shell receives}` for every tool it reads structurally."""
    return asyncio.run(_produce())


if __name__ == "__main__":  # pragma: no cover
    print(json.dumps(produce(), indent=1))
