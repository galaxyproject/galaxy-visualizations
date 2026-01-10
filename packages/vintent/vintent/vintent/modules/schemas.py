from __future__ import annotations

from typing import Any, Dict, List, Literal, TypedDict

CompletionsMessage = Dict[str, str]
CompletionsReply = Dict[str, Any]

FieldType = Literal["any", "nominal", "ordinal", "quantitative", "temporal"]
TranscriptMessageType = Dict[str, Any]


class DatasetProfile(TypedDict):
    fields: Dict[str, FieldInfo]
    row_count: int


class FieldInfo(TypedDict):
    type: FieldType
    cardinality: int
    unique_ratio: float
    missing_ratio: float
    min: float | None
    max: float | None


class ValidationError(TypedDict, total=False):
    code: Literal[
        "aggregate_missing",
        "bin_missing",
        "invalid_aggregate_target",
        "invalid_bin_target",
        "invalid_field_type",
        "invalid_signature",
        "missing_required_encoding",
        "not_enough_fields",
        "not_enough_quantitative_fields",
        "unknown_field",
        "unknown_shell",
    ]
    details: Dict[str, Any]


class ValidationWarning(TypedDict, total=False):
    code: Literal["high_cardinality_color", "high_cardinality_x", "large_dataset_embedded"]
    details: Dict[str, Any]


class ValidationResult(TypedDict):
    errors: List[ValidationError]
    ok: bool
    warnings: List[ValidationWarning]
