from typing import Any

import pandas as pd

PROCESS_ID = "column_statistics"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: list[dict[str, Any]], params: dict[str, Any]) -> list[dict[str, Any]]:
    if not rows:
        return []

    df = pd.DataFrame(rows)
    num = df.select_dtypes(include="number")

    out: list[dict[str, Any]] = []
    for c in num.columns:
        s = num[c]
        if s.empty:
            continue
        out.append(
            {
                "column": c,
                "count": int(s.count()),
                "mean": float(s.mean()),
                "std": float(s.std()),
                "min": float(s.min()),
                "max": float(s.max()),
            }
        )

    return out


def log(params: dict[str, Any]) -> str:
    return "Computed column statistics."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
