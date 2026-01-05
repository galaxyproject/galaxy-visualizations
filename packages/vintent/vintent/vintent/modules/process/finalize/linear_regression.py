from typing import Any, Dict, List

PROCESS_ID = "linear_regression"


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    if not rows:
        return []

    xcol = params.get("x")
    ycol = params.get("y")
    if not xcol or not ycol:
        return rows

    xs: List[float] = []
    ys: List[float] = []

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

    out: List[Dict[str, object]] = []
    for row in rows:
        xv = row.get(xcol)
        new_row = dict(row)
        if isinstance(xv, (int, float)):
            new_row["yhat"] = slope * float(xv) + intercept
        else:
            continue
        out.append(new_row)

    return out


def log(params: Dict[str, Any]) -> str:
    return "Computed linear regression."


PROCESS = {
    "id": PROCESS_ID,
    "log": log,
    "run": run,
}
