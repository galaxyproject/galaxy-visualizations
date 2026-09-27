from __future__ import annotations

from typing import Any, Literal

from olit.registry.extensions.vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class BoxPlotGroupedShell(BaseShell):
    name = "Grouped Box Plot"
    description = "Compare distributions of a quantitative field across categories with optional color grouping."
    goals = ["distribution", "comparison", "outliers"]
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: list[list[FieldType]] = [
        ["nominal", "quantitative"],
    ]

    required: dict[str, Any] = {
        "x": {"type": "nominal"},
        "y": {"type": "quantitative"},
    }

    optional: dict[str, Any] = {
        "color": {"type": "nominal"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        fields = profile.get("fields", {})
        return any(v.get("type") == "nominal" for v in fields.values()) and any(
            v.get("type") == "quantitative" for v in fields.values()
        )

    def compile(
        self,
        params: ShellParamsType,
        values: list[dict[str, Any]],
        renderer: RendererType,
    ) -> dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        encoding: dict[str, Any] = {
            "x": {"field": params["x"], "type": "nominal"},
            "y": {"field": params["y"], "type": "quantitative"},
        }

        if params.get("color"):
            encoding["color"] = {"field": params["color"], "type": "nominal"}

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {"type": "boxplot"},
            "encoding": encoding,
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})
        x_field = params.get("x")
        y_field = params.get("y")

        for encoding, field, expected in (("x", x_field, "nominal"), ("y", y_field, "quantitative")):
            if not field:
                return {
                    "ok": False,
                    "errors": [{"code": "missing_required_encoding", "details": {"encoding": encoding}}],
                    "warnings": [],
                }
            if field not in fields:
                return {
                    "ok": False,
                    "errors": [{"code": "unknown_field", "details": {"encoding": encoding, "field": field}}],
                    "warnings": [],
                }
            actual = fields[field].get("type")
            if actual != expected:
                return {
                    "ok": False,
                    "errors": [
                        {
                            "code": "invalid_field_type",
                            "details": {
                                "encoding": encoding,
                                "field": field,
                                "expected": expected,
                                "actual": actual,
                            },
                        }
                    ],
                    "warnings": [],
                }

        return {"ok": True, "errors": [], "warnings": []}
