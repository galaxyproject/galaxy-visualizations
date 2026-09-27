"""The node driver reaches Galaxy the way galaxy-charts asks it to.

galaxy-charts hands its client a path with no leading slash, so joining it is the driver's job.
A root carrying no trailing slash once produced `http://host:8080api/tool_data/hg`.
"""

import asyncio
import json
import shutil
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from olit.substrate.galaxy_charts import DRIVER
from olit.substrate.transport import NodeTransport

CHARTS = Path(DRIVER).parents[3] / "node_modules" / "galaxy-charts"

pytestmark = [
    pytest.mark.skipif(shutil.which("node") is None, reason="the driver needs node"),
    pytest.mark.skipif(not CHARTS.exists(), reason="galaxy-charts is not installed"),
]

TABLE = {"columns": ["name", "value"], "fields": [["hg38", "hg38.fa"]]}


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.seen.append((self.path, self.headers.get("x-api-key")))
        if self.path in self.server.redirect:
            self.send_response(302)
            self.send_header("location", self.server.redirect[self.path])
            self.send_header("content-length", "0")
            self.end_headers()
            return
        if self.path in self.server.refuse:
            self.send_response(500)
            self.send_header("content-length", "0")
            self.end_headers()
            return
        body = json.dumps(TABLE).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture
def galaxy():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.seen = []
    server.refuse = set()
    server.redirect = {}
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


@pytest.fixture
def elsewhere():
    """A second origin, so a leak would be visible as a request arriving here."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.seen = []
    server.refuse = set()
    server.redirect = {}
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


def options(root, galaxy, table):
    async def go():
        transport = NodeTransport(root, "k", driver=DRIVER)
        try:
            return await transport.run(
                "get_options", {"input": {"type": "data_table", "tables": [table]}, "context": {}}
            )
        finally:
            await transport.close()

    return asyncio.run(go())


def test_a_root_without_a_trailing_slash_still_reaches_the_api(galaxy):
    root = f"http://127.0.0.1:{galaxy.server_port}"

    envelope = options(root, galaxy, "hg")

    assert galaxy.seen == [("/api/tool_data/hg", "k")]
    assert envelope["success"] is True
    assert envelope["data"] == [
        {
            "label": "hg38",
            "value": {"id": "hg38.fa", "columns": ["name", "value"], "row": ["hg38", "hg38.fa"], "table": "hg"},
        }
    ]


def test_a_root_carrying_one_reaches_the_same_path(galaxy):
    root = f"http://127.0.0.1:{galaxy.server_port}/"

    envelope = options(root, galaxy, "dbkeys")

    assert galaxy.seen == [("/api/tool_data/dbkeys", "k")]
    assert envelope["success"] is True


def test_a_table_galaxy_refuses_leaves_the_framing_intact(galaxy):
    """galaxy-charts logs the refusal, and a log on stdout would be read as a message length."""
    galaxy.refuse.add("/api/tool_data/broken")

    envelope = options(f"http://127.0.0.1:{galaxy.server_port}", galaxy, "broken")

    assert envelope["success"] is True
    assert envelope["data"] == []


def test_a_call_the_driver_does_not_answer_is_refused(galaxy):
    async def go():
        transport = NodeTransport(f"http://127.0.0.1:{galaxy.server_port}", "k", driver=DRIVER)
        try:
            return await transport.run("get_datasets", {})
        finally:
            await transport.close()

    envelope = asyncio.run(go())

    assert envelope["success"] is False
    assert envelope["errorKind"] == "not_found"
    assert galaxy.seen == []


def test_a_redirect_does_not_carry_the_api_key_anywhere(galaxy, elsewhere):
    """A transport holding a Galaxy key may not follow a redirect: the key would go with it."""
    galaxy.redirect["/api/tool_data/moved"] = f"http://127.0.0.1:{elsewhere.server_port}/api/tool_data/moved"

    envelope = options(f"http://127.0.0.1:{galaxy.server_port}", galaxy, "moved")

    assert elsewhere.seen == [], "the key must not reach the redirect target"
    assert galaxy.seen == [("/api/tool_data/moved", "k")]
    assert envelope["success"] is True, "a table that cannot be read is skipped, not fatal"
    assert envelope["data"] == []


def test_a_same_origin_redirect_is_refused_too(galaxy):
    """The invariant is unconditional rather than an origin comparison, so this is refused as well."""
    galaxy.redirect["/api/tool_data/local"] = "/api/tool_data/hg"

    envelope = options(f"http://127.0.0.1:{galaxy.server_port}", galaxy, "local")

    assert envelope["data"] == []
    assert [path for path, _ in galaxy.seen] == ["/api/tool_data/local"]
