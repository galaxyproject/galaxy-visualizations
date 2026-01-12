from __future__ import annotations

import math
from collections import Counter
from typing import Any, Dict, List

PROCESS_ID = "fill_missing"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    field = params.get("field")
    strategy = params.get("strategy", "mean")
    fill_value = params.get("value")

    if not field:
        return rows

    # Compute fill value based on strategy
    if strategy == "value" and fill_value is not None:
        computed_fill = fill_value
    elif strategy == "zero":
        computed_fill = 0
    elif strategy in ("mean", "median"):
        values = [
            row.get(field) for row in rows if isinstance(row.get(field), (int, float)) and math.isfinite(row.get(field))
        ]
        if not values:
            computed_fill = 0
        elif strategy == "mean":
            computed_fill = sum(values) / len(values)
        else:  # median
            sorted_vals = sorted(values)
            n = len(sorted_vals)
            if n % 2 == 0:
                computed_fill = (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2
            else:
                computed_fill = sorted_vals[n // 2]
    elif strategy == "mode":
        counter: Counter = Counter()
        for row in rows:
            v = row.get(field)
            if v is not None:
                counter[v] += 1
        if counter:
            computed_fill = counter.most_common(1)[0][0]
        else:
            computed_fill = None
    elif strategy == "ffill":
        # Forward fill - handled in the loop
        computed_fill = None
    else:
        computed_fill = 0

    # Apply fill
    result: List[Dict[str, Any]] = []
    last_valid = computed_fill

    for row in rows:
        new_row = dict(row)
        v = row.get(field)

        is_missing = v is None or (isinstance(v, float) and not math.isfinite(v))

        if is_missing:
            if strategy == "ffill":
                new_row[field] = last_valid
            else:
                new_row[field] = computed_fill
        else:
            last_valid = v

        result.append(new_row)

    return result


def log(params: Dict[str, Any]) -> str:
    field = params.get("field", "unknown")
    strategy = params.get("strategy", "mean")
    return f"Filled missing values in {field} using {strategy} strategy."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
