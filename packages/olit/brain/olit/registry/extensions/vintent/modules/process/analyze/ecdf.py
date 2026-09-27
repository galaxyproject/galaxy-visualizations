from __future__ import annotations

from typing import Any

from olit.registry.extensions.vintent.modules.process import is_finite_number

PROCESS_ID = "ecdf"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "aggregate"


def run(rows: list[dict[str, Any]], params: dict[str, Any]) -> list[dict[str, Any]]:
    if not rows:
        return []

    field = params.get("field")
    group_by = params.get("group_by")

    if not field:
        return rows

    groups: dict[Any, list[float]] = {}

    for r in rows:
        v = r.get(field)
        if not is_finite_number(v):
            continue
        key = r.get(group_by) if group_by else None
        groups.setdefault(key, []).append(float(v))

    out: list[dict[str, Any]] = []

    for key, values in groups.items():
        if not values:
            continue
        values.sort()
        n = len(values)
        for i, v in enumerate(values, start=1):
            row: dict[str, Any] = {
                field: v,
                "ecdf": i / n,
            }
            if group_by:
                row[group_by] = key
            out.append(row)

    return out


def log(params: dict[str, Any]) -> str:
    field = params.get("field")
    group_by = params.get("group_by")
    if group_by:
        return f"Computed ECDF of {field} grouped by {group_by}."
    return f"Computed ECDF of {field}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "run": run,
    "log": log,
}
