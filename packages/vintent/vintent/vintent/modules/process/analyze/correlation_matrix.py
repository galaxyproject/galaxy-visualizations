import math
from typing import Any, Dict, List

PROCESS_ID = "correlation_matrix"


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    if not rows:
        return []

    numeric_fields: List[str] = []
    for key, value in rows[0].items():
        if isinstance(value, (int, float)):
            numeric_fields.append(key)

    if len(numeric_fields) < 2:
        return []

    series: Dict[str, List[float]] = {}
    for field in numeric_fields:
        values: List[float] = []
        for row in rows:
            v = row.get(field)
            if isinstance(v, (int, float)):
                values.append(float(v))
        if values:
            series[field] = values

    fields = list(series.keys())
    if len(fields) < 2:
        return []

    out: List[Dict[str, object]] = []

    for x in fields:
        xs = series[x]
        mean_x = sum(xs) / len(xs)
        var_x = sum((v - mean_x) ** 2 for v in xs)

        for y in fields:
            ys = series[y]
            mean_y = sum(ys) / len(ys)
            var_y = sum((v - mean_y) ** 2 for v in ys)

            cov = 0.0
            n = min(len(xs), len(ys))
            for i in range(n):
                cov += (xs[i] - mean_x) * (ys[i] - mean_y)

            denom = math.sqrt(var_x * var_y)
            value = cov / denom if denom != 0 else 0.0

            out.append(
                {
                    "x": x,
                    "y": y,
                    "value": value,
                }
            )

    return out


def log(params: Dict[str, Any]) -> str:
    return "Computed correlation matrix."


PROCESS = {
    "id": PROCESS_ID,
    "log": log,
    "run": run,
}
