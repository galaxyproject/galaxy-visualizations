"""What a tool call produced, and whether it counts as a failure.

Its own module so a handler can declare a failure without importing the surface that
dispatches it.
"""

import json
from dataclasses import dataclass


@dataclass
class ToolOutcome:
    """What a tool call produced, and whether it counts as a failure."""

    content: object
    is_error: bool = False
    refused: bool = False
    # Which Olit guard refused this call, so an eval can see one in a trajectory.
    guard: str | None = None

    @property
    def text(self):
        return self.content if isinstance(self.content, str) else json.dumps(self.content)


def rendered(envelope):
    """One Galaxy tool result as the model reads it.

    Every Galaxy tool answers in this shape, whoever ran it: the descriptions are galaxy-mcp's
    and promise a GalaxyResult whose payload is under `data`. The empty halves are left out.
    """
    out = {k: v for k, v in envelope.items() if k in ("data", "message", "pagination") and v is not None}
    return json.dumps(out, default=str)
