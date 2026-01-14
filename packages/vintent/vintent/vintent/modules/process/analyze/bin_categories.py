from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List

PROCESS_ID = "bin_categories"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    field = params.get("field")
    top_n = params.get("top_n", 10)
    other_label = params.get("other_label", "Other")

    if not field:
        return rows

    # Count occurrences
    counter: Counter = Counter()
    for row in rows:
        v = row.get(field)
        if v is not None:
            counter[v] += 1

    # Get top N categories
    top_categories = set(cat for cat, _ in counter.most_common(top_n))

    # Replace others
    result: List[Dict[str, Any]] = []
    for row in rows:
        new_row = dict(row)
        v = row.get(field)
        if v is not None and v not in top_categories:
            new_row[field] = other_label
        result.append(new_row)

    return result


def log(params: Dict[str, Any]) -> str:
    field = params.get("field", "unknown")
    top_n = params.get("top_n", 10)
    other_label = params.get("other_label", "Other")
    return f"Kept top {top_n} categories in {field}, grouped others as '{other_label}'."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
