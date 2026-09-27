from typing import Any

import pandas as pd

PROCESS_ID = "pivot_long_to_wide"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "aggregate"


def run(rows: list[dict[str, Any]], params: dict[str, Any]) -> list[dict[str, Any]]:
    if not rows:
        return []

    id_col = params.get("id")
    key_col = params.get("key")
    val_col = params.get("value")

    if not id_col or not key_col or not val_col:
        return rows

    df = pd.DataFrame(rows)

    if id_col not in df or key_col not in df or val_col not in df:
        return rows

    wide = df.pivot(index=id_col, columns=key_col, values=val_col).reset_index()

    out: list[dict[str, Any]] = []
    for _, r in wide.iterrows():
        filled = r.where(pd.notnull(r), None).to_dict()
        # A pivot names the new columns after the key column's values, which may be numbers, while
        # every consumer of a row reads its keys as column names.
        out.append({str(name): value for name, value in filled.items()})

    return out


def log(params: dict[str, Any]) -> str:
    return "Pivoted data from long to wide format."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
