from __future__ import annotations

from typing import Any, Literal

from olit.registry.extensions.vintent.modules.schemas import DatasetProfile, FieldType

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class DivergingBarShell(BaseShell):
    name = "Diverging Bar Chart"
    description = "Bars extending left and right from center, ideal for positive/negative values or comparisons."
    goals = ["comparison"]
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: list[list[FieldType]] = [
        ["nominal", "quantitative"],
    ]

    required: dict[str, Any] = {
        "category": {"type": "nominal"},
        "value": {"type": "quantitative"},
    }

    optional: dict[str, Any] = {
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
        values: list[dict[str, Any]],
        renderer: RendererType,
    ) -> dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        category = params.get("category", "")
        value = params.get("value", "")

        encoding: dict[str, Any] = {
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

