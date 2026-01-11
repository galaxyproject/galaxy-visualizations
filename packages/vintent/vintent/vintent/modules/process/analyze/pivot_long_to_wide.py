from typing import Any, Dict, List

import pandas as pd

PROCESS_ID = "pivot_long_to_wide"


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
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

    out: List[Dict[str, Any]] = []
    for _, r in wide.iterrows():
        out.append(r.where(pd.notnull(r), None).to_dict())

    return out


def log(params: Dict[str, Any]) -> str:
    return "Pivoted data from long to wide format."


PROCESS = {
    "id": PROCESS_ID,
    "log": log,
    "run": run,
}
