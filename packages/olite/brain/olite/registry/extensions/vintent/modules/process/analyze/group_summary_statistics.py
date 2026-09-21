from __future__ import annotations

import math
from typing import Any

PROCESS_ID = "group_summary_statistics"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "aggregate"


def _is_finite(v: Any) -> bool:
    return isinstance(v, (int, float)) and math.isfinite(v)


def _median(vals: list[float]) -> float:
    s = sorted(vals)
    n = len(s)
    m = n // 2
    if n % 2 == 1:
        return s[m]
    return (s[m - 1] + s[m]) / 2.0


def run(rows: list[dict[str, Any]], params: dict[str, Any]) -> list[dict[str, Any]]:
    if not rows:
        return []

    group_by = params.get("group_by")
    fields = params.get("fields") or []

    if not group_by or not fields:
        return rows

    groups: dict[Any, list[dict[str, Any]]] = {}
    for r in rows:
        groups.setdefault(r.get(group_by), []).append(r)

    out: list[dict[str, Any]] = []

    for g, items in groups.items():
        for f in fields:
            values = [r.get(f) for r in items if _is_finite(r.get(f))]
            if not values:
                continue

            mean = sum(values) / len(values)
            var = sum((v - mean) ** 2 for v in values) / len(values)
            std = math.sqrt(var)

            out.append(
                {
                    "group": g,
                    "field": f,
                    "count": len(values),
                    "mean": float(mean),
                    "median": float(_median(values)),
                    "std": float(std),
                    "min": float(min(values)),
                    "max": float(max(values)),
                }
            )

    return out


def log(params: dict[str, Any]) -> str:
    return "Computed grouped summary statistics."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
