from __future__ import annotations

import math
from typing import Any

from olit.registry.extensions.vintent.modules.process import is_finite_number

PROCESS_ID = "standardize_columns"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: list[dict[str, Any]], params: dict[str, Any]) -> list[dict[str, Any]]:
    if not rows:
        return []

    columns = params.get("columns") or []
    with_mean = params.get("with_mean", True)
    with_std = params.get("with_std", True)

    if not columns:
        return rows

    stats: dict[str, dict[str, float]] = {}

    for c in columns:
        vals = [float(value) for value in (r.get(c) for r in rows) if is_finite_number(value)]
        if not vals:
            continue
        mean = sum(vals) / len(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        std = math.sqrt(var) if var > 0 else 1.0
        stats[c] = {"mean": mean, "std": std}

    out: list[dict[str, Any]] = []

    for r in rows:
        nr = dict(r)
        for c, s in stats.items():
            v = r.get(c)
            if not is_finite_number(v):
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


def log(params: dict[str, Any]) -> str:
    cols = params.get("columns", [])
    return f"Standardized columns {cols}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
