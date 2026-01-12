from typing import Any, Dict, List

PROCESS_ID = "sort_rows"
PROCESS_PHASE = "extract"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def schema(profile, context=None):
    columns = list(profile["fields"].keys())
    if not columns:
        return None
    return {
        "id": PROCESS_ID,
        "phase": PROCESS_PHASE,
        "description": (
            "Sort rows by a column. ONLY use when the user explicitly asks to 'sort', "
            "'order', 'rank', or 'arrange' the data. Do NOT use for simple visualizations."
        ),
        "params": {
            "type": "object",
            "properties": {
                "field": {"type": "string", "enum": columns},
                "order": {"type": "string", "enum": ["asc", "desc"]},
            },
            "required": ["field", "order"],
            "additionalProperties": False,
        },
    }


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    if rows:
        field = params.get("field")
        order = params.get("order")
        reverse = order == "desc"
        out = sorted(
            rows,
            key=lambda r: (r.get(field) is None, r.get(field)),
            reverse=reverse,
        )
    return out


def log(params: Dict[str, Any]) -> str:
    field = params.get("field", "unknown")
    order = params.get("order", "asc")
    direction = "descending" if order == "desc" else "ascending"
    return f"Sorted rows by {field} in {direction} order."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "schema": schema,
    "log": log,
    "run": run,
}
