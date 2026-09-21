from __future__ import annotations

from typing import Any, Literal, Optional, TypedDict

from olite.registry.extensions.vintent.core.exceptions import AppError
from olite.registry.extensions.vintent.modules.profiler import DatasetProfile
from olite.registry.extensions.vintent.modules.schemas import FieldType, ValidationResult

VEGA_LITE_SCHEMA = "https://vega.github.io/schema/vega-lite/v6.json"


class ShellError(AppError):
    """Error during shell compilation or validation."""

    code = "SHELL_ERROR"


EncodingMapType = dict[str, "EncodingSpecType"]
RendererType = Literal["vega-lite"]
ShellParamsType = dict[str, Any]


class BaseShell:
    """
    Base class for all visualization shells.

    All attributes are class-level configuration.
    Attributes defaulting to None must be normalized by consumers.
    Shells are static strategy definitions, not stateful objects.
    """

    description: Optional[str] = None

    # Analytical goals this shell supports (used for intent-based selection) Valid goals.
    goals: list[str] = []

    # metadata
    optional: Optional[EncodingMapType] = None
    required: Optional[EncodingMapType] = None
    semantics: Literal["rowwise", "aggregate"] = "rowwise"
    signatures: Optional[list[list[FieldType]]] = None

    required: dict[str, Any] = {}
    optional: dict[str, Any] = {}
    processes = None

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not self.signatures:
            return True

        fields_by_type: dict[str, list[str]] = {}
        for name, meta in profile.get("fields", {}).items():
            t = meta.get("type") or "nominal"
            fields_by_type.setdefault(t, []).append(name)

        for sig in self.signatures:
            needed: dict[str, int] = {}
            for t in sig:
                needed[t] = needed.get(t, 0) + 1

            ok = True
            for t, n in needed.items():
                if t == "any":
                    if sum(len(v) for v in fields_by_type.values()) < n:
                        ok = False
                        break
                else:
                    if len(fields_by_type.get(t, [])) < n:
                        ok = False
                        break

            if ok:
                return True

        return False

    def validate(self, profile: DatasetProfile, params: ShellParamsType) -> ValidationResult:
        """Check the encodings the shell declares: present, naming a field, of the declared type."""
        fields = profile.get("fields", {})
        declared = {**{k: v for k, v in self.optional.items() if params.get(k)}, **self.required}
        errors: list[dict[str, Any]] = []
        for encoding, spec in declared.items():
            if not isinstance(spec, dict) or "type" not in spec:
                continue
            field = params.get(encoding)
            if not field:
                errors.append({"code": "missing_required_encoding", "details": {"encoding": encoding}})
                continue
            meta = fields.get(field)
            if meta is None:
                errors.append({"code": "unknown_field", "details": {"encoding": encoding, "field": field}})
                continue
            expected = spec.get("type", "any")
            if expected != "any" and meta.get("type") != expected:
                errors.append({
                    "code": "invalid_field_type",
                    "details": {"encoding": encoding, "field": field, "expected": expected, "actual": meta.get("type")},
                })
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


class EncodingSpecType(TypedDict, total=False):
    aggregate: bool | str
    bin: bool
    type: FieldType
