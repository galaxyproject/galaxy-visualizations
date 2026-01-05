import csv
import io
from datetime import datetime
from typing import Any, Dict, List

from vintent.modules.schemas import DatasetProfile, FieldInfo, FieldType

MAX_ENUM_VALUES = 100


def profile_csv(csv_text: str) -> DatasetProfile:
    rows = rows_from_csv(csv_text)
    return profile_rows(rows)


def rows_from_csv(csv_text: str) -> List[Dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    rows: List[Dict[str, Any]] = []
    for r in reader:
        row: Dict[str, Any] = {}
        for k, v in r.items():
            if v is None or v == "":
                row[k] = None
            else:
                row[k] = cast_value(v)
        rows.append(row)
    return rows


def profile_rows(rows: List[Dict[str, Any]]) -> DatasetProfile:
    if not rows:
        return {"fields": {}, "row_count": 0}
    row_count = len(rows)
    raw_values: Dict[str, List[Any]] = {}
    for row in rows:
        for k, v in row.items():
            raw_values.setdefault(k, []).append(v)
    fields: Dict[str, FieldInfo] = {}
    for key, values in raw_values.items():
        non_null = [v for v in values if v is not None]
        missing = row_count - len(non_null)
        inferred_type = infer_column_type(non_null)
        unique = list(dict.fromkeys(non_null))
        cardinality = len(unique)
        enum_values = None
        values_truncated = False
        if inferred_type == "nominal":
            if cardinality <= MAX_ENUM_VALUES:
                enum_values = unique
            else:
                values_truncated = True
        num_min = None
        num_max = None
        if inferred_type == "quantitative" and non_null:
            floats = [float(v) for v in non_null]
            num_min = min(floats)
            num_max = max(floats)
        fields[key] = {
            "type": inferred_type,
            "cardinality": cardinality,
            "unique_ratio": cardinality / row_count,
            "missing_ratio": missing / row_count,
            "min": num_min,
            "max": num_max,
            "values": enum_values,
            "values_truncated": values_truncated,
        }
    return {"fields": fields, "row_count": row_count}


def infer_column_type(values: List[Any]) -> FieldType:
    if not values:
        return "nominal"
    types = {type(v) for v in values}
    if types == {float}:
        return "quantitative"
    if types == {datetime}:
        return "temporal"
    return "nominal"


def cast_value(raw: str) -> Any:
    if is_numeric(raw):
        return float(raw)
    dt = parse_date(raw)
    if dt is not None:
        return dt
    return raw


def is_numeric(value: str) -> bool:
    try:
        float(value)
        return True
    except (ValueError, TypeError):
        return False


def parse_date(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
