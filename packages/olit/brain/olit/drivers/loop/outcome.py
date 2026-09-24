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
