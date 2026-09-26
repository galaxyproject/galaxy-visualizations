from __future__ import annotations

from typing import Any, Literal, TypedDict

CompletionsMessage = dict[str, str]
CompletionsReply = dict[str, Any]

FieldType = Literal["any", "nominal", "ordinal", "quantitative", "temporal"]
TranscriptMessageType = dict[str, Any]


class DatasetProfile(TypedDict):
    fields: dict[str, FieldInfo]
    row_count: int


class FieldInfo(TypedDict):
    type: FieldType
    cardinality: int
    unique_ratio: float
    missing_ratio: float
    min: float | None
    max: float | None


class ValidationErrorDetails(TypedDict, total=False):
    """Which encoding, column and type a validation error is about.

    The code names the condition and these name its subject. Before this the subject lived inside
    the code, so 34 spellings existed for six conditions and nothing could read the field out.
    Required keys differ by code and are asserted in `test_shell_validation_contract.py`.
    """

    encoding: str
    field: str
    expected: str
    actual: str
    field_type: str
    required: int
    found: int


class ValidationError(TypedDict, total=False):
    """A shell refusing the parameters it was given.

    Two pairs, because a column the planner chose and a column an analyze step was supposed to
    produce fail for different reasons and are fixed in different places: re-ask the planner, or
    repair the pipeline.
    """

    code: Literal[
        # An encoding the shell declares: absent, naming no known column, or the wrong type.
        "missing_required_encoding",
        "unknown_field",
        "invalid_field_type",
        # A column an analyze step should have produced: absent, or the wrong type.
        "missing_derived_field",
        "invalid_derived_field_type",
        # A requirement over the profile as a whole rather than one column.
        "not_enough_fields",
    ]
    details: ValidationErrorDetails


class ValidationWarning(TypedDict, total=False):
    code: Literal["high_cardinality_color", "high_cardinality_x", "large_dataset_embedded"]
    details: dict[str, Any]


class ValidationResult(TypedDict):
    errors: list[ValidationError]
    ok: bool
    warnings: list[ValidationWarning]
