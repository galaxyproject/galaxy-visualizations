from typing import Any

PROCESS_ID = "normalize_minmax"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: list[dict[str, Any]], params: dict[str, Any]) -> list[dict[str, Any]]:
    if not rows:
        return []

    field = params.get("field")
    if not field:
        return rows

    values: list[float] = []
    for r in rows:
        v = r.get(field)
        if isinstance(v, (int, float)):
            values.append(float(v))

    if not values:
        return rows

    vmin = min(values)
    vmax = max(values)

    out: list[dict[str, Any]] = []
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


def log(params: dict[str, Any]) -> str:
    field = params.get("field")
    return f"Normalized column '{field}' using min-max scaling."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
