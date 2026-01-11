from __future__ import annotations

import math
from typing import Any, Dict, List

PROCESS_ID = "standardize_columns"


def _is_finite(v: Any) -> bool:
    return isinstance(v, (int, float)) and math.isfinite(v)


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    columns = params.get("columns") or []
    with_mean = params.get("with_mean", True)
    with_std = params.get("with_std", True)

    if not columns:
        return rows

    stats: Dict[str, Dict[str, float]] = {}

    for c in columns:
        vals = [float(r[c]) for r in rows if _is_finite(r.get(c))]
        if not vals:
            continue
        mean = sum(vals) / len(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        std = math.sqrt(var) if var > 0 else 1.0
        stats[c] = {"mean": mean, "std": std}

    out: List[Dict[str, Any]] = []

    for r in rows:
        nr = dict(r)
        for c, s in stats.items():
            v = r.get(c)
            if not _is_finite(v):
                continue
            x = float(v)
            if with_mean:
                x -= s["mean"]
            if with_std:
                x /= s["std"]
            if math.isfinite(x):
                nr[c] = x
        out.append(nr)

    return out


def log(params: Dict[str, Any]) -> str:
    cols = params.get("columns", [])
    return f"Standardized columns {cols}."


PROCESS = {
    "id": PROCESS_ID,
    "log": log,
    "run": run,
}
