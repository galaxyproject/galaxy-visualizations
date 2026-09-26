"""Galaxy operations run by galaxy-ops, reached from wherever the brain happens to run.

One call for every operation. Nothing here knows what any of them do: the name and the
arguments go out, an envelope comes back. What olit keeps on this side is what olit owns --
the capability gate, and the tool contract the model reads.

Two transports reach the same operations. In the browser the shell has already loaded them
and olit calls across the Pyodide boundary; under CPython -- tests, evals -- a node process
loads the same module and answers one line at a time. The operation is the same either way,
so neither transport may know an operation by name.
"""

import asyncio
import copy
import json
import os
import re
import shutil

from .browser import in_browser

CAMEL = re.compile(r"_([a-z0-9])")
# The driver is beside this module so an installed brain carries it too.
DRIVER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "galaxy_ops_driver.mjs")


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


class GalaxyOpsUnavailable(RuntimeError):
    """A transport could not carry the call. Converted to a failure envelope at the facade."""


def failed(message):
    """A failure in the shape galaxy-ops states its own failures in."""
    return {"success": False, "message": message, "errorKind": "unavailable"}


class PyodideTransport:
    """The shell already holds the operations; call across the boundary to reach them."""

    def available(self):
        try:
            import js
        except ImportError:
            return False
        return getattr(js, "olitRunOperation", None) is not None

    async def run(self, name, wire):
        import js
        from pyodide.ffi import to_js

        answer = await js.olitRunOperation(name, to_js(wire, dict_converter=js.Object.fromEntries))
        # Pyodide hands back a proxy for a JS object and a dict for one it converted itself;
        # which of the two depends on the value, so take either and free only what can be freed.
        envelope = answer.to_py() if hasattr(answer, "to_py") else answer
        release = getattr(answer, "destroy", None)
        if callable(release):
            release()
        return envelope


class NodeTransport:
    """One node process for the session, holding the same operations the shell would."""

    # Long enough for an upload or a workflow import, short enough that a driver which stopped
    # answering does not hold the turn open. The browser has the shell's own lifecycle instead.
    REQUEST_TIMEOUT = 300

    def __init__(self, root, key, driver=DRIVER, timeout=REQUEST_TIMEOUT):
        self._root = root
        self._key = key
        self._driver = driver
        self._timeout = timeout
        self._process = None
        self._turn = 0
        # One request on the wire at a time: the answers come back on one stream.
        self._lock = asyncio.Lock()

    def available(self):
        return bool(self._root) and shutil.which("node") is not None and os.path.exists(self._driver)

    async def _started(self):
        if self._process is not None and self._process.returncode is None:
            return self._process
        environment = {**os.environ, "GALAXY_ROOT": self._root or "", "GALAXY_KEY": self._key or ""}
        self._process = await asyncio.create_subprocess_exec(
            "node",
            self._driver,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=environment,
            cwd=os.path.dirname(self._driver),
        )
        return self._process

    async def _stopped(self, process):
        stderr = (await process.stderr.read()).decode()[-2000:]
        self._process = None
        return GalaxyOpsUnavailable(f"galaxy-ops driver stopped: {stderr}")

    async def run(self, name, wire):
        async with self._lock:
            process = await self._started()
            self._turn += 1
            body = json.dumps({"id": self._turn, "name": name, "args": wire}).encode()
            process.stdin.write(f"{len(body)}\n".encode() + body)
            await process.stdin.drain()
            try:
                async with asyncio.timeout(self._timeout):
                    header = await process.stdout.readline()
                    if not header:
                        raise await self._stopped(process)
                    # readexactly, because an answer is routinely past what a line reader will
                    # buffer, and a reader that gave up mid-answer would pair the next one with
                    # this question.
                    payload = await process.stdout.readexactly(int(header))
            except asyncio.IncompleteReadError as exc:
                raise await self._stopped(process) from exc
            except TimeoutError as exc:
                # The answer to this question can no longer arrive in order, so the process
                # cannot be reused: end it and let the next call start a fresh one.
                await self.close()
                raise GalaxyOpsUnavailable(f"{name} did not answer within {self._timeout}s") from exc
        return json.loads(payload)["envelope"]

    async def close(self):
        if self._process is not None and self._process.returncode is None:
            self._process.stdin.close()
            await self._process.wait()
        self._process = None


class GalaxyOps:
    def __init__(self, config, manifest):
        self.manifest = manifest
        self._transports = [PyodideTransport()]
        # Outside Pyodide the key is how a brain reaches Galaxy at all; in the browser there is
        # none, and the shell authenticates with the user's session instead.
        if not in_browser():
            self._transports.append(NodeTransport(config.get("galaxy_root"), config.get("galaxy_key")))

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
        except GalaxyOpsUnavailable as exc:
            return failed(str(exc))
