from typing import Any, Dict, List

import pandas as pd

PROCESS_ID = "column_statistics"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    df = pd.DataFrame(rows)
    num = df.select_dtypes(include="number")

    out: List[Dict[str, Any]] = []
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


def log(params: Dict[str, Any]) -> str:
    return "Computed column statistics."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
