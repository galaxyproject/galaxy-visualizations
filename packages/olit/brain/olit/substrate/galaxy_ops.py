"""Galaxy operations run by galaxy-ops, reached from wherever the brain happens to run.

One call for every operation. Nothing here knows what any of them do: the name and the
arguments go out, an envelope comes back. What olit keeps on this side is what olit owns --
the capability gate, and the tool contract the model reads.

Two transports reach the same operations. In the browser the shell has already loaded them
and olit calls across the Pyodide boundary; under CPython -- tests, evals -- a node process
loads the same module and answers one line at a time. The operation is the same either way,
so neither transport may know an operation by name.
"""

import copy
import os
import re

from .browser import in_browser
from .transport import NodeTransport, PyodideTransport, TransportUnavailable, failed

CAMEL = re.compile(r"_([a-z0-9])")
# The driver is beside this module so an installed brain carries it too.
DRIVER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "galaxy_ops_driver.mjs")
# What the shell installs in the browser to reach the same operations.
ENTRY = "olitRunOperation"


def camel(key):
    """`tool_id` -> `toolId`, the spelling galaxy-ops takes on the wire."""
    return CAMEL.sub(lambda m: m.group(1).upper(), key)


def as_wire(args):
    """Rename the arguments an operation declares, and nothing inside them.

    Every galaxy-ops input is flat, so only the top level is ever a declared name. The values
    are Galaxy's own -- a tool's parameter map, a user tool's representation -- where
    `shell_command` and `queries_0|input2` mean what they say and renaming them breaks the call.
    """
    return {camel(k): v for k, v in (args or {}).items()}


class GalaxyOps:
    def __init__(self, config, manifest):
        self.manifest = manifest
        self._transports = [PyodideTransport(ENTRY)]
        # Outside Pyodide the key is how a brain reaches Galaxy at all; in the browser there is
        # none, and the shell authenticates with the user's session instead.
        if not in_browser():
            self._transports.append(NodeTransport(config.get("galaxy_root"), config.get("galaxy_key"), DRIVER))

    def scoped(self, manifest):
        """A view gated by a narrower manifest, sharing the SAME transports."""
        view = copy.copy(self)
        view.manifest = manifest
        return view

    async def close(self):
        """Release whatever a transport holds. A scoped view shares them, so this is idempotent."""
        for transport in self._transports:
            release = getattr(transport, "close", None)
            if release is not None:
                await release()

    def _transport(self):
        return next((t for t in self._transports if t.available()), None)

    def available(self):
        return self._transport() is not None

    async def run(self, name, args, capability="read"):
        """The operation's envelope, whether or not it succeeded.

        One channel: a failure is an envelope, as it is inside galaxy-ops. An operation that
        could not run is something to tell the model, not an exception for the loop to catch.
        The capability gate still raises, as it does everywhere else in the substrate.
        """
        self.manifest.require(capability)
        transport = self._transport()
        if transport is None:
            return failed("no galaxy-ops transport in this runtime")
        try:
            return await transport.run(name, as_wire(args))
        except TransportUnavailable as exc:
            return failed(str(exc))
