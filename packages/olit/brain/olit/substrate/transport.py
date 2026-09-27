"""Carrying a named call to a JS peer, from wherever the brain happens to run.

Two transports reach a peer. In the browser the shell has already loaded it and the brain calls
across the Pyodide boundary; under CPython -- tests, evals -- a node process loads the same module
and answers one line at a time. Neither knows what any call does: a name and its arguments go out,
an envelope comes back, so a peer's behaviour stays in the peer rather than split with a transport.
"""

import asyncio
import json
import os
import shutil


class TransportUnavailable(RuntimeError):
    """A transport could not carry the call. Converted to a failure envelope at a facade."""


def failed(message):
    """A failure in the shape galaxy-ops states its own failures in."""
    return {"success": False, "message": message, "errorKind": "unavailable"}


class PyodideTransport:
    """The shell already holds the peer; call the entry point it installed to reach it."""

    def __init__(self, entry):
        self._entry = entry

    def available(self):
        try:
            import js
        except ImportError:
            return False
        return getattr(js, self._entry, None) is not None

    async def run(self, name, wire):
        import js
        from pyodide.ffi import to_js

        call = getattr(js, self._entry)
        answer = await call(name, to_js(wire, dict_converter=js.Object.fromEntries))
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
    # How much of a stopped driver's stderr the failure carries, counted from the end.
    STDERR_TAIL = 2000

    def __init__(self, root, key, driver, timeout=REQUEST_TIMEOUT):
        self._root = root
        self._key = key
        self._driver = driver
        self._timeout = timeout
        self._process = None
        self._turn = 0
        self._stderr_tail = b""
        self._draining = None
        # One request on the wire at a time: the answers come back on one stream.
        self._lock = asyncio.Lock()
        # Neither node nor the driver beside this module appears mid-session, so resolve once.
        self._runnable = shutil.which("node") is not None and os.path.exists(driver)

    def available(self):
        return bool(self._root) and self._runnable

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
        self._stderr_tail = b""
        self._draining = asyncio.create_task(self._drain(self._process.stderr))
        return self._process

    async def _drain(self, stream):
        """Keep the tail of the driver's stderr; a pipe nobody reads blocks the process filling it."""
        while chunk := await stream.read(self.STDERR_TAIL):
            self._stderr_tail = (self._stderr_tail + chunk)[-self.STDERR_TAIL :]

    async def _stopped(self, process):
        if self._draining is not None:
            await self._draining
        stderr = self._stderr_tail.decode(errors="replace")
        self._process = None
        return TransportUnavailable(f"driver stopped: {stderr}")

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
                raise TransportUnavailable(f"{name} did not answer within {self._timeout}s") from exc
        return json.loads(payload)["envelope"]

    async def close(self):
        if self._process is not None and self._process.returncode is None:
            self._process.stdin.close()
            await self._process.wait()
        if self._draining is not None:
            self._draining.cancel()
            self._draining = None
        self._process = None
