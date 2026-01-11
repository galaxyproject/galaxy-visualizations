from typing import Any, Dict, List

from vintent.modules.utility import user_asked_for

PROCESS_ID = "project_columns"
PROCESS_PHASE = "extract"
REQUIRES_SHAPE = "rowwise"
PRODUCES_SHAPE = "rowwise"

MAX_PROJECT_COLUMNS = 100


def schema(profile, context=None):
    if not user_asked_for(context, ["select", "consider", "only", "keep", "use", "columns", "fields"]):
        return False
    columns = list(profile["fields"].keys())
    if not columns:
        return None
    if len(columns) > MAX_PROJECT_COLUMNS:
        columns = columns[:MAX_PROJECT_COLUMNS]
    return {
        "id": PROCESS_ID,
        "phase": PROCESS_PHASE,
        "description": "Select a subset of columns and drop all others.",
        "params": {
            "type": "object",
            "properties": {
                "columns": {
                    "type": "array",
                    "items": {"type": "string", "enum": columns},
                    "minItems": 1,
                },
            },
            "required": ["columns"],
            "additionalProperties": False,
        },
    }


def run(rows: List[Dict[str, object]], params: Dict[str, Any]) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    if rows:
        cols = params.get("columns", [])
        for row in rows:
            projected: Dict[str, object] = {}
            for c in cols:
                if c in row:
                    projected[c] = row.get(c)
            out.append(projected)
    return out


def log(params: Dict[str, Any]) -> str:
    cols = params.get("columns", [])
    if len(cols) == 0:
        return "No columns selected."
    elif len(cols) == 1:
        return f"Selected column: {cols[0]}."
    else:
        return f"Selected {len(cols)} columns: {', '.join(cols)}."


PROCESS = {
    "id": PROCESS_ID,
    "phase": PROCESS_PHASE,
    "requires_shape": REQUIRES_SHAPE,
    "produces_shape": PRODUCES_SHAPE,
    "schema": schema,
    "log": log,
    "run": run,
}
