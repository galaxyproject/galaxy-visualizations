from __future__ import annotations

import math
from typing import Any, Dict, List

PROCESS_ID = "percent_change"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    field = params.get("field")
    sort_by = params.get("sort_by")

    if not field:
        return rows

    # Sort if specified
    if sort_by:
        rows = sorted(rows, key=lambda r: (r.get(sort_by) is None, r.get(sort_by)))

    result: List[Dict[str, Any]] = []
    prev_value: float | None = None

    for row in rows:
        v = row.get(field)
        new_row = dict(row)

        if isinstance(v, (int, float)) and math.isfinite(v):
            if prev_value is not None and prev_value != 0:
                pct_change = ((v - prev_value) / abs(prev_value)) * 100
                new_row[f"{field}_pct_change"] = pct_change
            else:
                new_row[f"{field}_pct_change"] = None
            prev_value = v
        else:
            new_row[f"{field}_pct_change"] = None

        result.append(new_row)

    return result


def log(params: Dict[str, Any]) -> str:
    field = params.get("field", "unknown")
    return f"Computed percent change for {field}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
