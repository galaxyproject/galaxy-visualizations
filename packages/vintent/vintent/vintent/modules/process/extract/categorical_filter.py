from typing import Any, Dict, List

PROCESS_ID = "categorical_filter"
PROCESS_PHASE = "extract"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"


def schema(profile, context=None):
    categorical_columns = [name for name, meta in profile["fields"].items() if meta.get("type") == "nominal"]
    if not categorical_columns:
        return None
    properties: Dict[str, Any] = {
        "field": {
            "type": "string",
            "enum": categorical_columns,
        },
        "values": {
            "type": "array",
            "minItems": 1,
            "items": {"type": "string"},
        },
    }
    return {
        "id": PROCESS_ID,
        "phase": PROCESS_PHASE,
        "description": ("Filter rows by exact match on categorical fields."),
        "params": {
            "type": "object",
            "properties": properties,
            "required": ["field", "values"],
            "additionalProperties": False,
        },
    }


def log(params: Dict[str, Any]) -> str:
    values = ", ".join(str(v) for v in params.get("values", []))
    return f"Filter rows where {params.get('field')} is one of [{values}]."


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    if rows:
        field = params.get("field")
        values = set(str(v) for v in params.get("values", []))
        for row in rows:
            if field in row:
                v = row.get(field)
                if v is not None and str(v) in values:
                    out.append(row)
    return out


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "schema": schema,
    "log": log,
    "run": run,
}
