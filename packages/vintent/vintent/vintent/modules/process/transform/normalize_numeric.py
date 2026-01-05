from typing import Any, Dict, List

PROCESS_ID = "normalize_minmax"


def run(rows: List[Dict[str, Any]], params: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    field = params.get("field")
    if not field:
        return rows

    values: List[float] = []
    for r in rows:
        v = r.get(field)
        if isinstance(v, (int, float)):
            values.append(float(v))

    if not values:
        return rows

    vmin = min(values)
    vmax = max(values)

    out: List[Dict[str, Any]] = []
    for r in rows:
        new_row = dict(r)
        v = r.get(field)
        if isinstance(v, (int, float)):
            if vmax != vmin:
                new_row[field] = (float(v) - vmin) / (vmax - vmin)
            else:
                new_row[field] = 0.0
        out.append(new_row)

    return out


def log(params: Dict[str, Any]) -> str:
    field = params.get("field")
    return f"Normalized column '{field}' using min-max scaling."


PROCESS = {
    "id": PROCESS_ID,
    "log": log,
    "run": run,
}
