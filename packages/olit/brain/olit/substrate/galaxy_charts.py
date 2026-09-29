"""Visualization input options, resolved by galaxy-charts wherever the brain runs."""

import os

from .browser import in_browser
from .transport import NodeTransport, PyodideTransport, TransportUnavailable, failed

# The driver is beside this module so an installed brain carries it too.
DRIVER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "galaxy_charts_driver.mjs")
# What the shell installs in the browser to reach the same call.
ENTRY = "olitGetChartsOptions"


class GalaxyCharts:
    def __init__(self, config, manifest):
        self.manifest = manifest
        self._transports = [PyodideTransport(ENTRY)]
        # Outside Pyodide the key is how a brain reaches Galaxy at all; in the browser there is
        # none, and the shell authenticates with the user's session instead.
        if not in_browser():
            self._transports.append(NodeTransport(config.get("galaxy_root"), config.get("galaxy_key"), DRIVER))

    def scoped(self, manifest):
        """A view gated by a narrower manifest, sharing the SAME transports."""
        import copy

        view = copy.copy(self)
        view.manifest = manifest
        return view

    async def close(self):
        for transport in self._transports:
            release = getattr(transport, "close", None)
            if release is not None:
                await release()

    def _transport(self):
        return next((t for t in self._transports if t.available()), None)

    def available(self):
        return self._transport() is not None

    async def compile_spec(self, spec):
        """Whether Galaxy's own vega-lite accepts this spec, as an envelope either way."""
        transport = self._transport()
        if transport is None:
            return failed("no galaxy-charts transport in this runtime")
        try:
            return await transport.run("compile", {"spec": spec})
        except TransportUnavailable as exc:
            return failed(str(exc))

    async def get_options(self, declared_input, context=None):
        """The values an input may hold, as an envelope whether or not it succeeded."""
        self.manifest.require("read")
        transport = self._transport()
        if transport is None:
            return failed("no galaxy-charts transport in this runtime")
        try:
            return await transport.run("get_options", {"input": declared_input, "context": context or {}})
        except TransportUnavailable as exc:
            return failed(str(exc))
