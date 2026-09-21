from __future__ import annotations

from typing import Any, Dict, List, Literal

from olite.registry.extensions.vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class LineMultiShell(BaseShell):
    name = "Multi-Series Line Chart"
    description = "Multiple lines on the same chart, colored by category, for comparing trends."
    goals = ["trend", "comparison"]
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["temporal", "quantitative", "nominal"],
        ["quantitative", "quantitative", "nominal"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "any"},
        "y": {"type": "quantitative"},
        "color": {"type": "nominal"},
    }

    optional: Dict[str, Any] = {
        "strokeDash": {"type": "nominal"},
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

        x_field = params.get("x", "")
        y_field = params.get("y", "")
        color_field = params.get("color", "")

        # Determine x type based on data
        x_type = "temporal"
        if values:
            first_x = values[0].get(x_field)
            if isinstance(first_x, (int, float)):
                x_type = "quantitative"

        encoding: Dict[str, Any] = {
            "x": {"field": x_field, "type": x_type},
            "y": {"field": y_field, "type": "quantitative"},
            "color": {"field": color_field, "type": "nominal"},
        }

        if params.get("strokeDash"):
            encoding["strokeDash"] = {"field": params["strokeDash"], "type": "nominal"}

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {"type": "line", "point": True},
            "encoding": encoding,
        }

