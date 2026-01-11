from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

PROCESS_ID = "pca"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]):
    columns = params.get("columns") or []
    n_components = params.get("n_components", 2)
    scale = params.get("scale", True)

    if len(columns) < 2:
        raise Exception("pca_requires_two_columns")

    X = []
    kept_rows = []

    for r in rows:
        try:
            vals = [float(r[c]) for c in columns]
        except Exception:
            continue
        if any(np.isnan(v) for v in vals):
            continue
        X.append(vals)
        kept_rows.append(r)

    X = np.asarray(X, dtype=float)

    if X.shape[0] < X.shape[1]:
        raise Exception("pca_invalid_shape")

    mean = X.mean(axis=0)
    Xc = X - mean

    if scale:
        std = Xc.std(axis=0, ddof=0)
        std[std == 0] = 1.0
        Xc = Xc / std

    _, S, Vt = np.linalg.svd(Xc, full_matrices=False)
    components = Vt[:n_components]
    scores = Xc @ components.T

    out: List[Dict[str, Any]] = []
    for r, score in zip(kept_rows, scores):
        nr = dict(r)
        for i in range(n_components):
            nr[f"PC{i+1}"] = float(score[i])
        out.append(nr)

    return out


def log(params: Dict[str, Any]) -> str:
    cols = params.get("columns", [])
    n = params.get("n_components", 2)
    return f"Computed PCA with {n} components on columns {cols}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
