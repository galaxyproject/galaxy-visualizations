from typing import Any, Dict, List

PROCESS_ID = "range_filter"
PROCESS_PHASE = "extract"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def schema(profile, context=None):
    quantitative_columns = [name for name, meta in profile["fields"].items() if meta.get("type") == "quantitative"]
    if not quantitative_columns:
        return None
    return {
        "id": PROCESS_ID,
        "phase": PROCESS_PHASE,
        "description": (
            "Filter rows using numeric comparisons on quantitative fields."
            "Use for greater than, less than, above, below, or between conditions."
        ),
        "params": {
            "type": "object",
            "properties": {
                "field": {"type": "string", "enum": quantitative_columns},
                "min": {"type": "number"},
                "max": {"type": "number"},
            },
            "required": ["field"],
            "additionalProperties": False,
        },
    }


def log(params: Dict[str, Any]) -> str:
    field = params.get("field")
    min_v = params.get("min")
    max_v = params.get("max")
    if min_v is not None and max_v is not None:
        return f"Filter rows where {field} is between {min_v} and {max_v}."
    if min_v is not None:
        return f"Filter rows where {field} is >= {min_v}."
    if max_v is not None:
        return f"Filter rows where {field} is <= {max_v}."
    return f"No filtering applied on {field}."


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    if rows:
        field = params.get("field")
        min_v = params.get("min")
        max_v = params.get("max")
        if field in rows[0]:
            for row in rows:
                v = row.get(field)
                if isinstance(v, (int, float)):
                    if min_v is not None and v < min_v:
                        continue
                    if max_v is not None and v > max_v:
                        continue
                    out.append(row)
        else:
            out = rows
    return out


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "produces_shape": PRODUCES_SHAPE,
    "requires_shape": REQUIRES_SHAPE,
    "schema": schema,
    "log": log,
    "run": run,
}
