from typing import Any, Dict, List

import pandas as pd

PROCESS_ID = "cardinality_report"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "aggregate"


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    df = pd.DataFrame(rows)

    out: List[Dict[str, object]] = []
    for c in df.columns:
        out.append(
            {
                "column": c,
                "unique": int(df[c].nunique(dropna=True)),
            }
        )

    return out


def log(params: Dict[str, Any]) -> str:
    return f"Computed {PROCESS_ID}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
