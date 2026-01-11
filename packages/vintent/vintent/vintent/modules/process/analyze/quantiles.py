from __future__ import annotations

import math
from typing import Any, Dict, List

PROCESS_ID = "quantiles"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "aggregate"


def _is_finite(v: Any) -> bool:
    return isinstance(v, (int, float)) and math.isfinite(v)


def _quantile(sorted_vals: List[float], q: float) -> float:
    n = len(sorted_vals)
    if n == 1:
        return sorted_vals[0]
    pos = q * (n - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return sorted_vals[lo]
    w = pos - lo
    return sorted_vals[lo] * (1 - w) + sorted_vals[hi] * w


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    field = params.get("field")
    qs = params.get("quantiles") or [0.25, 0.5, 0.75]
    group_by = params.get("group_by")

    if not field:
        return rows

    out: List[Dict[str, Any]] = []

    if group_by:
        groups: Dict[Any, List[float]] = {}
        for r in rows:
            v = r.get(field)
            if _is_finite(v):
                groups.setdefault(r.get(group_by), []).append(float(v))

        for g, vals in groups.items():
            if not vals:
                continue
            vals.sort()
            for q in qs:
                out.append(
                    {
                        "group": g,
                        "field": field,
                        "q": q,
                        "value": float(_quantile(vals, q)),
                    }
                )
    else:
        vals = [float(r.get(field)) for r in rows if _is_finite(r.get(field))]
        if not vals:
            return []
        vals.sort()
        for q in qs:
            out.append(
                {
                    "field": field,
                    "q": q,
                    "value": float(_quantile(vals, q)),
                }
            )

    return out


def log(params: Dict[str, Any]) -> str:
    return "Computed quantiles."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
