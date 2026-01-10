from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

from vintent.modules.utility import user_asked_for

PROCESS_ID = "covariance"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def schema(profile, context=None):
    if not user_asked_for(context, ["covariance", "covariace", "covar"]):
        return None

    quantitative_columns = [name for name, meta in profile["fields"].items() if meta.get("type") == "quantitative"]
    if len(quantitative_columns) < 2:
        return None

    return {
        "id": PROCESS_ID,
        "phase": PROCESS_PHASE,
        "description": (
            "Compute the covariance matrix between quantitative columns. "
            "Shows how variables vary together in absolute units."
        ),
        "params": {
            "type": "object",
            "properties": {
                "columns": {
                    "type": "array",
                    "items": {"type": "string", "enum": quantitative_columns},
                    "minItems": 2,
                }
            },
            "required": ["columns"],
            "additionalProperties": False,
        },
    }


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
    "schema": schema,
    "log": log,
    "run": run,
}
