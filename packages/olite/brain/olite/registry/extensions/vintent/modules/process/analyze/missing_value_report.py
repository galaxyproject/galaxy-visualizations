from typing import Any

import pandas as pd

PROCESS_ID = "missing_value_report"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "aggregate"


def run(rows: list[dict[str, object]], params: dict[str, Any]) -> list[dict[str, object]]:
    if not rows:
        return []

    df = pd.DataFrame(rows)
    n = len(df)

    out: list[dict[str, object]] = []
    for c in df.columns:
        missing = int(df[c].isna().sum())
        out.append(
            {
                "column": c,
                "missing": missing,
                "ratio": missing / n if n else 0.0,
            }
        )

    return out


def log(params: dict[str, Any]) -> str:
    return "Computed missing value report."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
