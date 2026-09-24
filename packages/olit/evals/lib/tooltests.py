"""Stage a real analysis from a tool's own test, and grade against its expectation.

Galaxy resolves test files from two places and only one is served over HTTP:
inputs come from the tool's `test-data/` via the API, expected outputs live in a
clone of galaxy-test-data (`tool_util/verify/test_data.py`, GitDataResolver).
Galaxy serves those inputs but answers 404 for the expected outputs, so those are
vendored in `fixtures/tool-tests/`; `GALAXY_TEST_DATA` names a clone to fall back on.
"""

import hashlib
import json
import os
import pathlib
import time
import urllib.parse
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEST_DATA_REPO = "https://github.com/galaxyproject/galaxy-test-data.git"
POLL_SECONDS = 3


class ToolTestError(Exception):
    """The staging failed, which is not the same as the agent failing."""


class Galaxy:
    def __init__(self, base, key):
        self.base = base.rstrip("/")
        self.key = key

    def call(self, path, method="GET", body=None, raw=False, timeout=120):
        sep = "&" if "?" in path else "?"
        url = f"{self.base}/{path}{sep}key={self.key}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            url, data=data, method=method,
            headers={"Content-Type": "application/json"} if data else {})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = r.read()
        return payload if raw else json.loads(payload or b"null")

    # --- the tool's own test -------------------------------------------------

    def tests(self, tool_id):
        return self.call(f"api/tools/{urllib.parse.quote(tool_id)}/test_data")

    def test_file(self, tool_id, name):
        q = urllib.parse.urlencode({"filename": name})
        return self.call(f"api/tools/{urllib.parse.quote(tool_id)}/test_data_download?{q}", raw=True)

    # --- staging -------------------------------------------------------------

    def new_history(self, name):
        return self.call("api/histories", "POST", {"name": name})["id"]

    def upload(self, history_id, name, payload, datatype=None):
        boundary = uuid.uuid4().hex
        element = {"src": "files", "name": name}
        if datatype:
            element["ext"] = datatype
        targets = json.dumps([{"destination": {"type": "hdas"}, "elements": [element]}])
        parts = []
        for k, v in (("history_id", history_id), ("targets", targets)):
            parts.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="files_0|file_data"; '
            f'filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()
            + payload + b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        body = b"".join(parts)
        req = urllib.request.Request(
            f"{self.base}/api/tools/fetch?key={self.key}", data=body, method="POST",
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())["outputs"][0]["id"]

    def fetch_url(self, history_id, url, name, datatype=None):
        """Let Galaxy pull the file itself, so a large input never crosses this harness."""
        element = {"src": "url", "url": url, "name": name}
        if datatype:
            element["ext"] = datatype
        got = self.call("api/tools/fetch", "POST", {
            "history_id": history_id,
            "targets": [{"destination": {"type": "hdas"}, "elements": [element]}],
        })
        return got["outputs"][0]["id"]

    def await_dataset(self, dataset_id, timeout=600):
        for _ in range(max(1, timeout // POLL_SECONDS)):
            d = self.call(f"api/datasets/{dataset_id}")
            if d.get("state") in ("ok", "error", "paused", "deleted"):
                return d
            time.sleep(POLL_SECONDS)
        return self.call(f"api/datasets/{dataset_id}")

    def contents(self, history_id):
        return self.call(f"api/histories/{history_id}/contents?v=dev&deleted=false&visible=true")


# Galaxy serves a test's inputs but not its expected outputs, so those are vendored.
VENDORED_EXPECTATIONS = ROOT / "fixtures" / "tool-tests"


def expected_dir():
    """Where galaxy-test-data was cloned; Galaxy keys the cache by md5 of the repo url."""
    named = os.environ.get("GALAXY_TEST_DATA", "").strip()
    if named:
        return pathlib.Path(named)
    root = os.environ.get("GALAXY_ROOT", "").strip()
    if root:
        digest = hashlib.md5(TEST_DATA_REPO.encode()).hexdigest()
        return pathlib.Path(root) / "test-data-cache" / digest
    return None


def expected_bytes(name, extra_dirs=()):
    for d in [*extra_dirs, VENDORED_EXPECTATIONS, expected_dir()]:
        if d and (pathlib.Path(d) / name).exists():
            return (pathlib.Path(d) / name).read_bytes()
    raise ToolTestError(
        f"expected output {name!r} not found; add it to {VENDORED_EXPECTATIONS.name}/ "
        f"or clone {TEST_DATA_REPO} and set GALAXY_TEST_DATA")


def stage(galaxy, tool_id, test_index=0, history_name=None):
    """A history holding the test's input files. Returns (history_id, {filename: dataset_id})."""
    test = galaxy.tests(tool_id)[test_index]
    history_id = galaxy.new_history(history_name or f"eval {tool_id} #{test_index}")
    ids = {}
    for name, _ in test.get("required_files") or []:
        ids[name] = galaxy.upload(history_id, name, galaxy.test_file(tool_id, name))
    for name, dataset_id in ids.items():
        state = galaxy.await_dataset(dataset_id).get("state")
        if state != "ok":
            raise ToolTestError(f"input {name} landed in state {state}")
    return history_id, ids, test


def resolve_inputs(spec, ids):
    """The test names files; the tool wants dataset references.

    The test format lists every value, scalars included (`delimiter: ["T"]`), so a
    single-element list that is not a staged file is unwrapped. The descriptor's typed
    `request` gets this right already but nests repeats, which /api/tools does not take.
    """
    resolved = {}
    for key, value in spec.items():
        if not isinstance(value, list):
            resolved[key] = value
        elif value and all(isinstance(n, str) and n in ids for n in value):
            resolved[key] = ({"src": "hda", "id": ids[value[0]]} if len(value) == 1
                             else [{"src": "hda", "id": ids[n]} for n in value])
        elif len(value) == 1:
            resolved[key] = value[0]
        else:
            resolved[key] = value
    return resolved


def compare(produced, expected, attributes):
    """Galaxy's own definition of correct for this output. (ok, detail); ok=None means unsupported."""
    method = (attributes or {}).get("compare") or "diff"
    if method == "diff":
        got = produced.decode(errors="replace").splitlines()
        want = expected.decode(errors="replace").splitlines()
        allowed = (attributes or {}).get("lines_diff") or 0
        differing = sum(1 for a, b in zip(got, want) if a != b) + abs(len(got) - len(want))
        return differing <= allowed, f"{differing} differing line(s), {allowed} allowed"
    if method == "contains":
        return expected.strip() in produced, "substring present" if expected.strip() in produced else "substring absent"
    if method == "sim_size":
        delta = (attributes or {}).get("delta", 10000)
        diff = abs(len(produced) - len(expected))
        return diff <= delta, f"size differs by {diff}, {delta} allowed"
    return None, f"comparison {method!r} not implemented"


def grade_output(galaxy, tool_id, dataset_id, expectation, extra_dirs=()):
    """A failed job never passes, whatever its bytes say.

    Cut1 exits non-zero on a perl locale warning yet writes the correct output; grading
    the bytes alone reported PASS on an errored job.
    """
    dataset = galaxy.call(f"api/datasets/{dataset_id}")
    state = dataset.get("state")
    if state != "ok":
        return False, f"job state {state}, output not graded"
    produced = galaxy.call(f"api/datasets/{dataset_id}/display", raw=True)
    want = expected_bytes(expectation["value"], extra_dirs)
    return compare(produced, want, expectation.get("attributes"))
