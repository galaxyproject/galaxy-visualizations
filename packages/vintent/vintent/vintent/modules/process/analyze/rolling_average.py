from __future__ import annotations

import math
from typing import Any, Dict, List

PROCESS_ID = "rolling_average"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    field = params.get("field")
    window = params.get("window", 3)
    sort_by = params.get("sort_by")

    if not field or window < 1:
        return rows

    # Sort if specified
    if sort_by:
        rows = sorted(rows, key=lambda r: (r.get(sort_by) is None, r.get(sort_by)))

    result: List[Dict[str, Any]] = []
    values_buffer: List[float] = []

    for row in rows:
        v = row.get(field)
        new_row = dict(row)

        if isinstance(v, (int, float)) and math.isfinite(v):
            values_buffer.append(v)
            if len(values_buffer) > window:
                values_buffer.pop(0)
            avg = sum(values_buffer) / len(values_buffer)
            new_row[f"{field}_rolling_avg"] = avg
        else:
            new_row[f"{field}_rolling_avg"] = None

        result.append(new_row)

    return result


def log(params: Dict[str, Any]) -> str:
    field = params.get("field", "unknown")
    window = params.get("window", 3)
    return f"Computed {window}-period rolling average of {field}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
