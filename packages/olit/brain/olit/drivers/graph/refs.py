"""Reference path resolution for agent pipelines."""

import logging
from typing import Any

from .types import Context

logger = logging.getLogger(__name__)

# Valid root namespaces for $ref paths
VALID_NAMESPACES = frozenset({"state", "inputs", "run", "result"})


def get_path(path: str, ctx: Context, state: dict[str, Any]) -> Any:
    """Resolve a dot-notation path to its value."""
    parts = str(path).split(".")
    root = parts[0]
    rest = parts[1:]

    # Resolve root namespace
    cur: Any = None
    if root == "state":
        cur = state
    elif root == "inputs":
        cur = state.get("inputs")
    elif root == "run":
        cur = ctx.get("run")
    elif root == "result":
        cur = ctx.get("result")
    else:
        # Warn about invalid namespace to help debug silent failures
        logger.warning(
            "Invalid $ref namespace '%s' in path '%s'. "
            "Valid namespaces: %s. Returning None.",
            root,
            path,
            ", ".join(sorted(VALID_NAMESPACES)),
        )
        return None

    # Traverse remaining path segments
    for segment in rest:
        if isinstance(cur, dict) and segment in cur:
            cur = cur[segment]
        else:
            return None

    return cur
