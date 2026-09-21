from __future__ import annotations

from typing import Any, Literal

from olite.registry.extensions.vintent.modules.schemas import DatasetProfile, FieldType

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class BubbleChartShell(BaseShell):
    name = "Bubble Chart"
    description = "Scatter plot with sized bubbles to show three quantitative dimensions."
    goals = ["relationship"]
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: list[list[FieldType]] = [
        ["quantitative", "quantitative", "quantitative"],
    ]

    required: dict[str, Any] = {
        "x": {"type": "quantitative"},
        "y": {"type": "quantitative"},
        "size": {"type": "quantitative"},
    }

    optional: dict[str, Any] = {
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
        values: list[dict[str, Any]],
        renderer: RendererType,
    ) -> dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        encoding: dict[str, Any] = {
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

