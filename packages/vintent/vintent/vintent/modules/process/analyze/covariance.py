from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

PROCESS_ID = "covariance"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "aggregate"


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]):
    columns = params.get("columns") or []

    X = []
    for r in rows:
        try:
            vals = [float(r[c]) for c in columns]
        except Exception:
            continue
        if any(np.isnan(v) for v in vals):
            continue
        X.append(vals)

    if len(X) < 2:
        raise Exception("covariance_invalid_shape")

    X = np.asarray(X, dtype=float)
    cov = np.cov(X, rowvar=False)

    out: List[Dict[str, Any]] = []
    for i, xi in enumerate(columns):
        for j, yj in enumerate(columns):
            out.append(
                {
                    "x": xi,
                    "y": yj,
                    "value": float(cov[i, j]),
                }
            )

    return out


def log(params: Dict[str, Any]) -> str:
    cols = params.get("columns", [])
    return f"Computed covariance matrix for columns {cols}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
