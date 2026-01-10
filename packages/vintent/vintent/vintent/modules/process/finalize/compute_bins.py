from typing import Any, Dict, List

PROCESS_ID = "compute_bins"

DEFAULT_BINS = 10
MAX_BINS = 50


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    if not rows:
        return []
    field = params.get("field")
    bins = params.get("bins", DEFAULT_BINS)
    values: List[float] = []
    for row in rows:
        v = row.get(field)
        if isinstance(v, (int, float)):
            values.append(float(v))
    if not values:
        return []
    min_v = min(values)
    max_v = max(values)
    if min_v == max_v:
        return [
            {
                "bin": f"[{min_v}, {max_v}]",
                "bin_start": min_v,
                "bin_end": max_v,
                "count": len(values),
            }
        ]
    width = (max_v - min_v) / bins
    counts = [0] * bins
    for v in values:
        idx = int((v - min_v) / width)
        if idx == bins:
            idx = bins - 1
        counts[idx] += 1
    out: List[Dict[str, object]] = []
    for i, c in enumerate(counts):
        start = min_v + i * width
        end = start + width
        out.append(
            {
                "bin": f"[{start}, {end}]",
                "bin_start": start,
                "bin_end": end,
                "count": float(c),
            }
        )
    return out


def log(params: Dict[str, Any]) -> str:
    bins = params.get("bins", DEFAULT_BINS)
    return f"Computed histogram bins with {bins} bins."


PROCESS = {
    "id": PROCESS_ID,
    "log": log,
    "run": run,
}
