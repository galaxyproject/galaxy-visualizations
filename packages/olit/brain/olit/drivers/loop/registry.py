"""The tool registry every domain module declares into.

Holds the declaration primitives and the dispatch surface, so a domain module can register
its own tools without importing the module that assembles them.
"""

from collections.abc import Callable
from urllib.parse import urlencode

from .galaxy_tool_docs import DOCS

# A declaration per advertised tool, and the handler for the ones olit runs itself. A tool
# declared with no handler is one galaxy-ops runs.
TOOLS: list[dict] = []
HANDLERS: dict[str, Callable | None] = {}

_STR = {"type": "string"}
_INT = {"type": "integer"}
_BOOL = {"type": "boolean"}


def _q(params):
    """Query string from a dict; drop None, lowercase bools, repeat a key per list item."""
    clean = {}
    for k, v in params.items():
        if v is None:
            continue
        clean[k] = str(v).lower() if isinstance(v, bool) else v
    return ("?" + urlencode(clean, doseq=True)) if clean else ""


def _tool(name, capability, description, properties, required, handler):
    # galaxy-mcp's verbatim docstring is the model-facing description.
    HANDLERS[name] = handler
    TOOLS.append(
        {
            "name": name,
            "capability": capability,
            "handler": handler,
            "schema": {
                "type": "function",
                "function": {
                    "name": name,
                    "description": DOCS.get(name, description),
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": list(required),
                    },
                },
            },
        }
    )


def tool_schemas(manifest):
    """Advertised tool schemas, filtered to the capabilities the manifest grants."""
    return [t["schema"] for t in TOOLS if manifest.allows(t["capability"])]


def declared(name):
    """One tool's declaration, whether or not a manifest would advertise it."""
    return next((t for t in TOOLS if t["name"] == name), None)


def get_handler(name):
    return HANDLERS.get(name)
