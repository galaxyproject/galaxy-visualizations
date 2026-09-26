from __future__ import annotations

import math
from typing import Any

from olit.registry.extensions.vintent.modules.process import is_finite_number

PROCESS_ID = "group_aggregate"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "aggregate"

AGG_OPS = {"mean", "sum", "min", "max", "count"}


def run(rows: list[dict[str, Any]], params: dict[str, Any]) -> list[dict[str, Any]]:
    if not rows:
        return []
    group_by = params.get("group_by")
    op = params.get("op")
    metric = params.get("metric")
    if not group_by or not op or op not in AGG_OPS:
        return rows
    groups: dict[Any, list[dict[str, Any]]] = {}
    for row in rows:
        key = row.get(group_by)
        groups.setdefault(key, []).append(row)
    if op == "count":
        return [{group_by: key, "count": len(group)} for key, group in groups.items()]
    # Every other op reduces a column, so without one there is nothing to reduce.
    if not metric:
        return rows
    out: list[dict[str, Any]] = []
    for key, group in groups.items():
        values = [value for value in (r.get(metric) for r in group) if is_finite_number(value)]
        if not values:
            continue
        if op == "mean":
            agg = sum(values) / len(values)
        elif op == "sum":
            agg = sum(values)
        elif op == "min":
            agg = min(values)
        elif op == "max":
            agg = max(values)
        else:
            continue
        if not math.isfinite(agg):
            continue
        out.append({group_by: key, metric: float(agg)})
    return out


def log(params: dict[str, Any]) -> str:
    group_by = params.get("group_by")
    op = params.get("op")
    metric = params.get("metric")
    if op == "count":
        return f"Grouped by {group_by} and counted rows."
    return f"Grouped by {group_by} and computed {op} of {metric}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
