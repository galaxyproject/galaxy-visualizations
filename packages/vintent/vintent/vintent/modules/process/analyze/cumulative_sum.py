from __future__ import annotations

import math
from typing import Any, Dict, List

PROCESS_ID = "cumulative_sum"
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
    cumsum: float = 0.0

    for row in rows:
        v = row.get(field)
        new_row = dict(row)

        if isinstance(v, (int, float)) and math.isfinite(v):
            cumsum += v
            new_row[f"{field}_cumsum"] = cumsum
        else:
            new_row[f"{field}_cumsum"] = cumsum

        result.append(new_row)

    return result


def log(params: Dict[str, Any]) -> str:
    field = params.get("field", "unknown")
    return f"Computed cumulative sum of {field}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
