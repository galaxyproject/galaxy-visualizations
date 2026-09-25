"""Galaxy operations run by galaxy-ops in the shell, reached across the Pyodide boundary.

One call for every operation. Nothing here knows what any of them do: the name and the
arguments go out, an envelope comes back. What olit keeps on this side is what olit owns --
the capability gate, and the tool contract the model reads.
"""

import json
import re

CAMEL = re.compile(r"_([a-z0-9])")


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
    """No executor in this runtime: outside the browser, or the module did not load."""


class GalaxyOps:
    def __init__(self, config, manifest):
        self.manifest = manifest

    def scoped(self, manifest):
        view = GalaxyOps.__new__(GalaxyOps)
        view.manifest = manifest
        return view

    def available(self):
        try:
            import js
        except ImportError:
            return False
        return getattr(js, "olitRunOperation", None) is not None

    async def run(self, name, args, capability="read"):
        """The operation's data, or a ToolOutcome-shaped error the caller can return."""
        self.manifest.require(capability)
        try:
            import js
            from pyodide.ffi import to_js
        except ImportError as exc:  # pragma: no cover - exercised only outside Pyodide
            raise GalaxyOpsUnavailable(str(exc)) from exc
        answer = await js.olitRunOperation(name, to_js(as_wire(args), dict_converter=js.Object.fromEntries))
        # Pyodide hands back a proxy for a JS object and a dict for one it converted itself;
        # which of the two depends on the value, so take either and free only what can be freed.
        envelope = answer.to_py() if hasattr(answer, "to_py") else answer
        release = getattr(answer, "destroy", None)
        if callable(release):
            release()
        if not envelope.get("success"):
            return None, envelope.get("message") or f"{name} failed"
        return envelope, None


def rendered(envelope):
    """The envelope as the model sees it, with the empty halves left out."""
    out = {k: v for k, v in envelope.items() if k in ("data", "message", "pagination") and v is not None}
    return json.dumps(out, default=str)
