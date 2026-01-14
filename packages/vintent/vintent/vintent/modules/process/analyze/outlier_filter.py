from __future__ import annotations

import math
from typing import Any, Dict, List

PROCESS_ID = "outlier_filter"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    field = params.get("field")
    method = params.get("method", "iqr")
    threshold = params.get("threshold", 1.5 if method == "iqr" else 3.0)

    if not field:
        return rows

    # Extract numeric values
    values = []
    for row in rows:
        v = row.get(field)
        if isinstance(v, (int, float)) and math.isfinite(v):
            values.append(v)

    if len(values) < 4:
        return rows

    if method == "iqr":
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        q1 = sorted_vals[n // 4]
        q3 = sorted_vals[(3 * n) // 4]
        iqr = q3 - q1
        lower = q1 - threshold * iqr
        upper = q3 + threshold * iqr
    else:  # z-score
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        std = math.sqrt(variance) if variance > 0 else 0
        if std == 0:
            return rows
        lower = mean - threshold * std
        upper = mean + threshold * std

    result: List[Dict[str, Any]] = []
    for row in rows:
        v = row.get(field)
        if isinstance(v, (int, float)) and math.isfinite(v):
            if lower <= v <= upper:
                result.append(row)
        else:
            # Keep rows with non-numeric values
            result.append(row)

    return result


def log(params: Dict[str, Any]) -> str:
    field = params.get("field", "unknown")
    method = params.get("method", "iqr")
    threshold = params.get("threshold", 1.5 if method == "iqr" else 3.0)
    method_name = "IQR" if method == "iqr" else "Z-score"
    return f"Removed outliers from {field} using {method_name} (threshold={threshold})."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
