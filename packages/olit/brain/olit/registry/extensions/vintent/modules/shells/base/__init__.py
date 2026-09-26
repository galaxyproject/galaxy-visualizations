from __future__ import annotations

from typing import Any, Literal, Optional, TypedDict, TypeGuard

from olit.registry.extensions.vintent.core.exceptions import AppError
from olit.registry.extensions.vintent.modules.profiler import DatasetProfile
from olit.registry.extensions.vintent.modules.schemas import FieldType, ValidationError, ValidationResult

VEGA_LITE_SCHEMA = "https://vega.github.io/schema/vega-lite/v6.json"


class ShellError(AppError):
    """Error during shell compilation or validation."""

    code = "SHELL_ERROR"


# A declared parameter is either an encoding the planner fills with a column name, recognised by its
# string `type`, or a JSON Schema fragment the planner receives verbatim (`tools.is_encoding_spec`).
EncodingMapType = dict[str, "EncodingSpecType | ParamSchemaType"]
RendererType = Literal["vega-lite"]
ShellParamsType = dict[str, Any]


class BaseShell:
    """
    Base class for all visualization shells.

    All attributes are class-level configuration.
    Shells are static strategy definitions, not stateful objects.
    """

    description: Optional[str] = None

    # Analytical goals this shell supports (used for intent-based selection) Valid goals.
    goals: list[str] = []

    # metadata
    optional: EncodingMapType = {}
    required: EncodingMapType = {}
    semantics: Literal["rowwise", "aggregate"] = "rowwise"
    signatures: Optional[list[list[FieldType]]] = None

    def processes(self, profile: DatasetProfile, params: ShellParamsType) -> list[dict[str, Any]]:
        """Analyze steps to run before compiling, as `{id, params}`; none by default."""
        return []

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not self.signatures:
            return True

        fields_by_type: dict[str, list[str]] = {}
        for name, meta in profile.get("fields", {}).items():
            field_type = meta.get("type") or "nominal"
            fields_by_type.setdefault(field_type, []).append(name)

        for sig in self.signatures:
            needed: dict[FieldType, int] = {}
            for wanted in sig:
                needed[wanted] = needed.get(wanted, 0) + 1

            ok = True
            for wanted, count in needed.items():
                if wanted == "any":
                    if sum(len(v) for v in fields_by_type.values()) < count:
                        ok = False
                        break
                else:
                    if len(fields_by_type.get(wanted, [])) < count:
                        ok = False
                        break

            if ok:
                return True

        return False

    def validate(self, profile: DatasetProfile, params: ShellParamsType) -> ValidationResult:
        """Check the encodings the shell declares: present, naming a field, of the declared type."""
        fields = profile.get("fields", {})
        declared = {**{k: v for k, v in self.optional.items() if params.get(k)}, **self.required}
        errors: list[ValidationError] = []
        for encoding, spec in declared.items():
            if not is_encoding_spec(spec):
                continue
            field = params.get(encoding)
            if not field:
                errors.append({"code": "missing_required_encoding", "details": {"encoding": encoding}})
                continue
            meta = fields.get(field)
            if meta is None:
                errors.append({"code": "unknown_field", "details": {"encoding": encoding, "field": field}})
                continue
            expected = spec["type"]
            if expected != "any" and meta.get("type") != expected:
                errors.append(
                    {
                        "code": "invalid_field_type",
                        "details": {
                            "encoding": encoding,
                            "field": field,
                            "expected": expected,
                            "actual": meta.get("type"),
                        },
                    }
                )
        return {"ok": not errors, "errors": errors, "warnings": []}

    def validate_or_raise(self, profile: DatasetProfile, params: ShellParamsType) -> None:
        """Validate parameters and raise ShellError if invalid.

        This method calls validate() and raises ShellError if validation fails,
        providing consistency with how ProcessError is used for process failures.

        Args:
            profile: The dataset profile
            params: Shell parameters to validate

        Raises:
            ShellError: If validation fails
        """
        result = self.validate(profile, params)
        if not result.get("ok"):
            errors = result.get("errors", [])
            # Build error message from validation errors
            if errors:
                first_error = errors[0]
                code = first_error.get("code", "validation_failed")
                details = first_error.get("details", {})
                message = f"Shell validation failed: {code}"
            else:
                code = "validation_failed"
                details = {}
                message = "Shell validation failed"

            raise ShellError(
                message,
                details={
                    "validation_errors": errors,
                    "warnings": result.get("warnings", []),
                    **details,
                },
            )


class _EncodingType(TypedDict):
    """`type` is what `is_encoding_spec` reads, so an entry without one is not an encoding."""

    type: FieldType


class EncodingSpecType(_EncodingType, total=False):
    aggregate: bool | str
    bin: bool


class ParamSchemaType(TypedDict, total=False):
    """A parameter that is not a column. It carries no `type`, which is what keeps it out of
    `is_encoding_spec` and so out of the column selectors the planner is offered."""

    enum: list[Any]
    description: str


def is_encoding_spec(spec: Any) -> TypeGuard[EncodingSpecType]:
    """An entry the planner fills with a column name, rather than one it receives verbatim."""
    return isinstance(spec, dict) and "type" in spec and isinstance(spec["type"], str)
