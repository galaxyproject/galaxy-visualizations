"""get_job_details asks for full=true to read a failed job's stderr; the log comes with it."""

import asyncio

from olit.drivers.loop.agent import MAX_TOOL_RESULT_BYTES
from olit.drivers.loop.galaxy_tools import JOB_LOG_BYTES, _get_job_details


class FakeGalaxy:
    def __init__(self, job):
        self.job = job
        self.paths = []

    async def get(self, path, binary=False):
        self.paths.append(path)
        if path.startswith("api/datasets/"):
            return {"id": "d1", "creating_job": "j1"}
        return self.job


def call(job):
    g = FakeGalaxy(job)
    return asyncio.run(_get_job_details(g, {"dataset_id": "d1"})), g


def test_a_chatty_job_stays_under_the_dispatcher_cap():
    noisy = "\n".join(f"line {i} of warnings" for i in range(30000))
    out, _ = call({"id": "j1", "state": "error", "tool_stderr": noisy, "stderr": noisy})
    assert len(str(out).encode()) < MAX_TOOL_RESULT_BYTES


def test_the_end_of_the_log_is_what_is_kept():
    noisy = "\n".join(f"warning number {i}" for i in range(2000))
    out, _ = call({"id": "j1", "tool_stderr": noisy + "\nRuntimeError: the real cause"})
    assert out["tool_stderr"].endswith("RuntimeError: the real cause")
    assert len(out["tool_stderr"].encode()) <= JOB_LOG_BYTES + len("[Showing the last x of y bytes.]\n")


def test_a_trimmed_log_starts_on_a_whole_line():
    noisy = "\n".join(f"warning number {i}" for i in range(2000))
    out, _ = call({"id": "j1", "tool_stderr": noisy})
    notice, first = out["tool_stderr"].split("\n")[:2]
    assert notice.startswith("[Showing the last ") and notice.endswith(f"of {len(noisy)} bytes.]")
    assert first.startswith("warning number")


def test_a_short_log_is_returned_whole():
    out, _ = call({"id": "j1", "tool_stderr": "Traceback: boom"})
    assert out["tool_stderr"] == "Traceback: boom"


def test_the_rest_of_the_job_is_untouched():
    out, g = call({"id": "j1", "state": "error", "params": {"input": "d0"}})
    assert out["params"] == {"input": "d0"} and out["state"] == "error"
    assert g.paths[-1] == "api/jobs/j1?full=true"
