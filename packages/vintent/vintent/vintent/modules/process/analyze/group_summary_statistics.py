from __future__ import annotations

import math
from typing import Any, Dict, List

PROCESS_ID = "group_summary_statistics"


def _is_finite(v: Any) -> bool:
    return isinstance(v, (int, float)) and math.isfinite(v)


def _median(vals: List[float]) -> float:
    s = sorted(vals)
    n = len(s)
    m = n // 2
    if n % 2 == 1:
        return s[m]
    return (s[m - 1] + s[m]) / 2.0


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    group_by = params.get("group_by")
    fields = params.get("fields") or []

    if not group_by or not fields:
        return rows

    groups: Dict[Any, List[Dict[str, Any]]] = {}
    for r in rows:
        groups.setdefault(r.get(group_by), []).append(r)

    out: List[Dict[str, Any]] = []

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


def log(params: Dict[str, Any]) -> str:
    return "Computed grouped summary statistics."


PROCESS = {
    "id": PROCESS_ID,
    "log": log,
    "run": run,
}
