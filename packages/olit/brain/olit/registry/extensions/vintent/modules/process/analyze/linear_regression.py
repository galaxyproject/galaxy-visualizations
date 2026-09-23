from typing import Any

PROCESS_ID = "linear_regression"
PROCESS_PHASE = "analyze"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def run(rows: list[dict[str, object]], params: dict[str, Any]) -> list[dict[str, object]]:
    if not rows:
        return []

    xcol = params.get("x")
    ycol = params.get("y")
    if not xcol or not ycol:
        return rows

    xs: list[float] = []
    ys: list[float] = []

    for row in rows:
        xv = row.get(xcol)
        yv = row.get(ycol)
        if isinstance(xv, (int, float)) and isinstance(yv, (int, float)):
            xs.append(float(xv))
            ys.append(float(yv))

    if len(xs) < 2:
        return rows

    xm = sum(xs) / len(xs)
    ym = sum(ys) / len(ys)

    den = sum((x - xm) ** 2 for x in xs)
    if den == 0:
        return rows

    slope = sum((x - xm) * (y - ym) for x, y in zip(xs, ys)) / den
    intercept = ym - slope * xm

    out: list[dict[str, object]] = []
    for row in rows:
        xv = row.get(xcol)
        new_row = dict(row)
        if isinstance(xv, (int, float)):
            new_row["yhat"] = slope * float(xv) + intercept
        else:
            continue
        out.append(new_row)

    return out


def log(params: dict[str, Any]) -> str:
    return "Computed linear regression."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "log": log,
    "run": run,
}
