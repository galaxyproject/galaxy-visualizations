from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, TypedDict, Union

from vintent.core.exceptions import AppError
from vintent.modules.profiler import DatasetProfile
from vintent.modules.schemas import FieldType, ValidationResult

VEGA_LITE_SCHEMA = "https://vega.github.io/schema/vega-lite/v6.json"


class ShellError(AppError):
    """Error during shell compilation or validation."""

    code = "SHELL_ERROR"


EncodingMapType = Dict[str, "EncodingSpecType"]
RendererType = Literal["vega-lite"]
ShellParamsType = Dict[str, Any]


class BaseShell:
    """
    Base class for all visualization shells.

    All attributes are class-level configuration.
    Attributes defaulting to None must be normalized by consumers.
    Shells are static strategy definitions, not stateful objects.
    """

    description: Optional[str] = None

    # Analytical goals this shell supports (used for intent-based selection)
    # Valid goals: distribution, relationship, comparison, composition, trend, ranking, summary, outliers
    goals: List[str] = []

    # metadata
    optional: Optional[EncodingMapType] = None
    required: Optional[EncodingMapType] = None
    semantics: Literal["rowwise", "aggregate"] = "rowwise"
    signatures: Optional[List[List[FieldType]]] = None

    # processes
    processes = None

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not self.signatures:
            return True

        fields_by_type: Dict[str, List[str]] = {}
        for name, meta in profile.get("fields", {}).items():
            t = meta.get("type") or "nominal"
            fields_by_type.setdefault(t, []).append(name)

        for sig in self.signatures:
            needed: Dict[str, int] = {}
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
        """Validate shell parameters against the dataset profile.

        Subclasses should override this method to implement validation logic.

        Returns:
            ValidationResult with ok=True if valid, ok=False with errors otherwise.
        """
        return {"ok": True, "errors": [], "warnings": []}

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
    aggregate: Union[bool, str]
    bin: bool
    type: FieldType
