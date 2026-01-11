from __future__ import annotations

import math
from typing import Any, Dict, List

PROCESS_ID = "drop_missing"


def _is_missing(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and not math.isfinite(v):
        return True
    return False


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    columns = params.get("columns") or []
    if not columns:
        return rows

    out: List[Dict[str, Any]] = []
    for r in rows:
        ok = True
        for c in columns:
            if _is_missing(r.get(c)):
                ok = False
                break
        if ok:
            out.append(r)

    return out


def log(params: Dict[str, Any]) -> str:
    cols = params.get("columns", [])
    return f"Dropped rows with missing values in {cols}."


PROCESS = {
    "id": PROCESS_ID,
    "log": log,
    "run": run,
}
