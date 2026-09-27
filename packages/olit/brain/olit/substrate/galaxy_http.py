"""Direct, capability-gated Galaxy REST access by path."""

import copy
import logging

from .http import http

logger = logging.getLogger(__name__)


class GalaxyHttp:
    def __init__(self, config, manifest):
        self._root = (config.get("galaxy_root") or "/").rstrip("/") + "/"
        self._key = config.get("galaxy_key")
        self.manifest = manifest
        self._reachable = None

    def scoped(self, manifest):
        """A view of this client gated by a narrower manifest (same root and key)."""
        view = copy.copy(self)
        view.manifest = manifest
        return view

    async def probe(self):
        """Whether Galaxy answers on the path the tools use. Ungated: liveness, not an action."""
        try:
            await http.request("GET", self._url("api/version"), headers=self._headers())
            self._reachable = True
        except Exception as exc:
            logger.warning("galaxy did not answer at %s: %s", self._root, exc)
            self._reachable = False
        return self._reachable

    def reachable(self):
        return bool(self._reachable)

    def _headers(self):
        headers = {}
        if self._key:
            headers["x-api-key"] = self._key
        return headers

    async def get(self, path, binary=False):
        self.manifest.require("read")
        return await http.request("GET", self._url(path), headers=self._headers(), binary=binary)

    async def post(self, path, body=None):
        self.manifest.require("write")
        return await http.request("POST", self._url(path), headers=self._headers(), body=body or {})

    async def put(self, path, body=None):
        self.manifest.require("write")
        return await http.request("PUT", self._url(path), headers=self._headers(), body=body or {})

    async def delete(self, path):
        self.manifest.require("write")
        return await http.request("DELETE", self._url(path), headers=self._headers())

    def _url(self, path):
        return f"{self._root}{path.lstrip('/')}"
