from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class DivergingBarShell(BaseShell):
    name = "Diverging Bar Chart"
    description = "Bars extending left and right from center, ideal for positive/negative values or comparisons."
    goals = ["comparison"]
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["nominal", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "category": {"type": "nominal"},
        "value": {"type": "quantitative"},
    }

    optional: Dict[str, Any] = {
        "color": {"type": "nominal"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        fields = profile.get("fields", {})
        has_nominal = any(v.get("type") == "nominal" for v in fields.values())
        has_quant = any(v.get("type") == "quantitative" for v in fields.values())
        return has_nominal and has_quant

    def compile(
        self,
        params: ShellParamsType,
        values: List[Dict[str, Any]],
        renderer: RendererType,
    ) -> Dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        category = params.get("category", "")
        value = params.get("value", "")

        encoding: Dict[str, Any] = {
            "y": {"field": category, "type": "nominal", "sort": "-x"},
            "x": {"field": value, "type": "quantitative"},
        }

        # Color by positive/negative if no color field specified
        if params.get("color"):
            encoding["color"] = {"field": params["color"], "type": "nominal"}
        else:
            encoding["color"] = {
                "condition": {
                    "test": f"datum['{value}'] >= 0",
                    "value": "#4C78A8",
                },
                "value": "#E45756",
            }

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": "bar",
            "encoding": encoding,
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        category = params.get("category")
        value = params.get("value")

        if not category or not value:
            return {
                "errors": [{"code": "missing_required_encoding"}],
                "ok": False,
                "warnings": [],
            }

        fields = profile.get("fields", {})
        cat_meta = fields.get(category)
        val_meta = fields.get(value)

        if not cat_meta or not val_meta:
            return {
                "errors": [{"code": "unknown_field"}],
                "ok": False,
                "warnings": [],
            }

        if cat_meta.get("type") != "nominal":
            return {
                "errors": [{"code": "invalid_field_type", "details": {"field": category}}],
                "ok": False,
                "warnings": [],
            }

        if val_meta.get("type") != "quantitative":
            return {
                "errors": [{"code": "invalid_field_type", "details": {"field": value}}],
                "ok": False,
                "warnings": [],
            }

        return {"errors": [], "ok": True, "warnings": []}
