"""Reference path resolution for agent pipelines.

Resolves dot-notation paths like "state.user.name" to actual values.
"""

import logging
from typing import Any

from .types import Context

logger = logging.getLogger(__name__)

# Valid root namespaces for $ref paths
VALID_NAMESPACES = frozenset({"state", "inputs", "run", "result", "loop"})


def get_path(path: str, ctx: Context, state: dict[str, Any]) -> Any:
    """Resolve a dot-notation path to its value.

    Supports the following root namespaces:
    - state: The runner's state dictionary
    - inputs: Input values (shortcut for state.inputs)
    - run: Current run context (resolved input)
    - result: Result from current node execution
    - loop: Loop iteration context

    Args:
        path: Dot-notation path like "state.user.name" or "inputs.id"
        ctx: The current execution context
        state: The runner's state dictionary

    Returns:
        The resolved value, or None if path doesn't exist.

    Example:
        >>> state = {"inputs": {"id": "123"}, "user": {"name": "Alice"}}
        >>> get_path("state.user.name", {}, state)
        'Alice'
        >>> get_path("inputs.id", {}, state)
        '123'
    """
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
    elif root == "loop":
        cur = ctx.get("loop")
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
