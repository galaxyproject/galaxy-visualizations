from __future__ import annotations

import math
from typing import Any

PROCESS_ID = "drop_missing"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def _is_missing(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and not math.isfinite(v):
        return True
    return False


def run(rows: list[dict[str, Any]], params: dict[str, Any]) -> list[dict[str, Any]]:
    if not rows:
        return []

    columns = params.get("columns") or []
    if not columns:
        return rows

    out: list[dict[str, Any]] = []
    for r in rows:
        ok = True
        for c in columns:
            if _is_missing(r.get(c)):
                ok = False
                break
        if ok:
            out.append(r)

    return out


def log(params: dict[str, Any]) -> str:
    cols = params.get("columns", [])
    return f"Dropped rows with missing values in {cols}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
