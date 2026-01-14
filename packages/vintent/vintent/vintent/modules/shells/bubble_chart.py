from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class BubbleChartShell(BaseShell):
    name = "Bubble Chart"
    description = "Scatter plot with sized bubbles to show three quantitative dimensions."
    goals = ["relationship"]
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["quantitative", "quantitative", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "quantitative"},
        "y": {"type": "quantitative"},
        "size": {"type": "quantitative"},
    }

    optional: Dict[str, Any] = {
        "color": {"type": "nominal"},
        "tooltip": {"type": "any"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        fields = profile.get("fields", {})
        quant_count = sum(1 for v in fields.values() if v.get("type") == "quantitative")
        return quant_count >= 3

    def compile(
        self,
        params: ShellParamsType,
        values: List[Dict[str, Any]],
        renderer: RendererType,
    ) -> Dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        encoding: Dict[str, Any] = {
            "x": {"field": params.get("x", ""), "type": "quantitative"},
            "y": {"field": params.get("y", ""), "type": "quantitative"},
            "size": {"field": params.get("size", ""), "type": "quantitative"},
        }

        if params.get("color"):
            encoding["color"] = {"field": params["color"], "type": "nominal"}

        if params.get("tooltip"):
            encoding["tooltip"] = {"field": params["tooltip"]}

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {"type": "circle", "opacity": 0.7},
            "encoding": encoding,
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        x_field = params.get("x")
        y_field = params.get("y")
        size_field = params.get("size")

        if not x_field or not y_field or not size_field:
            return {
                "errors": [{"code": "missing_required_encoding"}],
                "ok": False,
                "warnings": [],
            }

        fields = profile.get("fields", {})

        for field_name in [x_field, y_field, size_field]:
            meta = fields.get(field_name)
            if not meta:
                return {
                    "errors": [{"code": "unknown_field", "details": {"field": field_name}}],
                    "ok": False,
                    "warnings": [],
                }
            if meta.get("type") != "quantitative":
                return {
                    "errors": [{"code": "invalid_field_type", "details": {"field": field_name}}],
                    "ok": False,
                    "warnings": [],
                }

        return {"errors": [], "ok": True, "warnings": []}
