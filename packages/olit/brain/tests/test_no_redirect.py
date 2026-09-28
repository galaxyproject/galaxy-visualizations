"""A request carrying the Galaxy api key may not leave the origin it was aimed at.

`fetch` defaults to following redirects, and `x-api-key` is a custom header so nothing strips it
the way the spec strips `Authorization`. Both node drivers hold the key, so both pass their
requests through this one wrapper.
"""

import json
import shutil
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

WRAPPER = Path(__file__).resolve().parents[1] / "olit" / "substrate" / "no_redirect.mjs"

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="the wrapper needs node")


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.seen.append((self.path, self.headers.get("x-api-key")))
        target = self.server.redirect.get(self.path)
        if target:
            self.send_response(302)
            self.send_header("location", target)
            self.send_header("content-length", "0")
            self.end_headers()
            return
        body = b'{"ok": true}'
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def _serve():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.seen = []
    server.redirect = {}
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


@pytest.fixture
def origins():
    """Two origins: a leak shows up as the key arriving at the second."""
    galaxy, galaxy_thread = _serve()
    elsewhere, elsewhere_thread = _serve()
    yield galaxy, elsewhere
    for server, thread in ((galaxy, galaxy_thread), (elsewhere, elsewhere_thread)):
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def fetched(url):
    """The wrapper's answer for `url`, as the drivers call it."""
    program = (
        f'import {{ noRedirect }} from "{WRAPPER.as_posix()}";'
        f'const r = await noRedirect("{url}", {{ headers: {{ "x-api-key": "SECRET" }} }});'
        "process.stdout.write(JSON.stringify({ status: r.status }));"
    )
    out = subprocess.run(["node", "--input-type=module", "-e", program], capture_output=True, text=True, timeout=30)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_a_cross_origin_redirect_is_not_followed(origins):
    galaxy, elsewhere = origins
    galaxy.redirect["/api/tool_data/hg"] = f"http://127.0.0.1:{elsewhere.server_port}/api/tool_data/hg"

    answer = fetched(f"http://127.0.0.1:{galaxy.server_port}/api/tool_data/hg")

    assert elsewhere.seen == [], "the key must not reach the redirect target"
    assert answer["status"] == 302, "the redirect is handed back rather than followed"
    assert galaxy.seen == [("/api/tool_data/hg", "SECRET")]


def test_a_same_origin_redirect_is_not_followed_either(origins):
    """The invariant is unconditional: no origin comparison to get wrong."""
    galaxy, _ = origins
    galaxy.redirect["/api/tool_data/moved"] = "/api/tool_data/hg"

    answer = fetched(f"http://127.0.0.1:{galaxy.server_port}/api/tool_data/moved")

    assert answer["status"] == 302
    assert [path for path, _ in galaxy.seen] == ["/api/tool_data/moved"]


def test_a_plain_request_still_carries_the_key_and_succeeds(origins):
    galaxy, _ = origins

    answer = fetched(f"http://127.0.0.1:{galaxy.server_port}/api/tool_data/hg")

    assert answer["status"] == 200
    assert galaxy.seen == [("/api/tool_data/hg", "SECRET")]
