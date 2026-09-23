"""Inject the real bearer token upstream.

pi forwards the literal string "PROXY_API_KEY" rather than resolving the env var, so a
direct run 401s. This sits in front of Jetstream2 and swaps the header.
"""
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

UPSTREAM = os.environ["UPSTREAM"].rstrip("/")
KEY = os.environ["REAL_KEY"]


class Handler(BaseHTTPRequestHandler):
    def _forward(self, body=None):
        url = f"{UPSTREAM}{self.path}"
        req = urllib.request.Request(url, data=body, method=self.command)
        for k, v in self.headers.items():
            if k.lower() in ("host", "authorization", "content-length", "x-api-key"):
                continue
            req.add_header(k, v)
        req.add_header("Authorization", f"Bearer {KEY}")
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                data = r.read()
                self.send_response(r.status)
                for k, v in r.headers.items():
                    if k.lower() in ("transfer-encoding", "connection", "content-length"):
                        continue
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def do_GET(self):
        self._forward()

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        self._forward(self.rfile.read(n) if n else None)

    def log_message(self, *a):
        pass


HTTPServer(("127.0.0.1", int(os.environ.get("PORT", "8123"))), Handler).serve_forever()
