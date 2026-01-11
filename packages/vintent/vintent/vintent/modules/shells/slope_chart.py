from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class SlopeChartShell(BaseShell):
    name = "Slope Chart"
    description = "Compare values between two time points, showing change as connecting lines."
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["nominal", "nominal", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "category": {"type": "nominal"},
        "period": {"type": "nominal"},
        "value": {"type": "quantitative"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        fields = profile.get("fields", {})
        nominal_count = sum(1 for v in fields.values() if v.get("type") == "nominal")
        has_quant = any(v.get("type") == "quantitative" for v in fields.values())
        return nominal_count >= 2 and has_quant

    def compile(
        self,
        params: ShellParamsType,
        values: List[Dict[str, Any]],
        renderer: RendererType,
    ) -> Dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        category = params.get("category", "")
        period = params.get("period", "")
        value = params.get("value", "")

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "encoding": {
                "x": {"field": period, "type": "nominal"},
                "y": {"field": value, "type": "quantitative"},
                "color": {"field": category, "type": "nominal"},
            },
            "layer": [
                {
                    "mark": {"type": "line", "strokeWidth": 2},
                },
                {
                    "mark": {"type": "circle", "size": 80},
                },
                {
                    "mark": {"type": "text", "align": "left", "dx": 5},
                    "encoding": {
                        "text": {"field": category, "type": "nominal"},
                    },
                },
            ],
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        category = params.get("category")
        period = params.get("period")
        value = params.get("value")

        if not category or not period or not value:
            return {
                "errors": [{"code": "missing_required_encoding"}],
                "ok": False,
                "warnings": [],
            }

        fields = profile.get("fields", {})

        for field_name, expected_type in [(category, "nominal"), (period, "nominal"), (value, "quantitative")]:
            meta = fields.get(field_name)
            if not meta:
                return {
                    "errors": [{"code": "unknown_field", "details": {"field": field_name}}],
                    "ok": False,
                    "warnings": [],
                }
            if meta.get("type") != expected_type:
                return {
                    "errors": [{"code": "invalid_field_type", "details": {"field": field_name}}],
                    "ok": False,
                    "warnings": [],
                }

        return {"errors": [], "ok": True, "warnings": []}
