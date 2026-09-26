"""Reference path resolution for agent pipelines."""

from typing import Any

from olit.exceptions import NodeExecutionError

from .types import Context

# Valid root namespaces for $ref paths
VALID_NAMESPACES = frozenset({"state", "inputs", "run", "result"})

_ABSENT = object()


def _type_name(value: Any) -> str:
    return "null" if value is None else type(value).__name__


def get_path(path: str, ctx: Context, state: dict[str, Any]) -> Any:
    """Resolve a dot-notation path: a path that is not there is a fault, a null it holds is a value."""
    parts = str(path).split(".")
    root = parts[0]
    rest = parts[1:]

    cur: Any
    if root == "state":
        cur = state
    elif root == "inputs":
        cur = state.get("inputs", _ABSENT)
    elif root == "run":
        cur = ctx.get("run", _ABSENT)
    elif root == "result":
        cur = ctx.get("result", _ABSENT)
    else:
        raise NodeExecutionError(
            f"$ref '{path}' names no namespace",
            details={"path": path, "namespace": root, "available": sorted(VALID_NAMESPACES)},
        )

    if cur is _ABSENT:
        raise NodeExecutionError(
            f"$ref '{path}' reads {root}, which this node does not have",
            details={"path": path, "namespace": root},
        )

    walked = [root]
    for segment in rest:
        if not isinstance(cur, dict):
            raise NodeExecutionError(
                f"$ref '{path}' reads '{segment}' from a {_type_name(cur)}",
                details={"path": path, "resolved": ".".join(walked), "found": _type_name(cur)},
            )
        if segment not in cur:
            raise NodeExecutionError(
                f"$ref '{path}' stops at '{segment}'",
                details={"path": path, "resolved": ".".join(walked), "available": sorted(cur)},
            )
        cur = cur[segment]
        walked.append(segment)

    return cur
