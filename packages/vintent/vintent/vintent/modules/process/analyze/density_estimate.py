from __future__ import annotations

import math
from typing import Any, Dict, List

import numpy as np

PROCESS_ID = "density_estimate"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "aggregate"


def _is_finite(v: Any) -> bool:
    return isinstance(v, (int, float)) and math.isfinite(v)


def _kde_1d(x: np.ndarray, grid: np.ndarray) -> np.ndarray:
    n = len(x)
    if n < 2:
        return np.zeros_like(grid)
    std = x.std(ddof=1)
    if std == 0 or not math.isfinite(std):
        return np.zeros_like(grid)
    bw = 1.06 * std * (n ** (-1 / 5))
    if bw <= 0 or not math.isfinite(bw):
        return np.zeros_like(grid)
    diff = (grid[:, None] - x[None, :]) / bw
    return np.exp(-0.5 * diff**2).sum(axis=1) / (n * bw * math.sqrt(2 * math.pi))


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    group_by = params.get("group_by")
    field = params.get("field")
    points = int(params.get("points", 50))

    if not rows or not field:
        return []

    groups: Dict[Any, List[float]] = {}

    for r in rows:
        v = r.get(field)
        if not _is_finite(v):
            continue
        key = r.get(group_by) if group_by else "__all__"
        groups.setdefault(key, []).append(float(v))

    out: List[Dict[str, Any]] = []

    for key, values in groups.items():
        if len(values) < 2:
            continue

        x = np.asarray(values, dtype=float)
        lo = x.min()
        hi = x.max()
        if not math.isfinite(lo) or not math.isfinite(hi) or lo == hi:
            continue

        grid = np.linspace(lo, hi, points)
        dens = _kde_1d(x, grid)

        for gv, dv in zip(grid, dens):
            if not math.isfinite(dv):
                continue
            out.append(
                {
                    "value": float(gv),
                    "density": float(dv),
                    "group": key,
                }
            )

    return out


def log(params: Dict[str, Any]) -> str:
    field = params.get("field")
    group_by = params.get("group_by")
    if group_by:
        return f"Estimated density of {field} grouped by {group_by}."
    return f"Estimated density of {field}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "run": run,
    "log": log,
}
