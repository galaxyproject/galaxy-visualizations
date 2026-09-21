from __future__ import annotations

from typing import Any, Dict, List, Literal

from olite.registry.extensions.vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class AreaChartShell(BaseShell):
    name = "Area Chart"
    description = "Filled area chart for showing trends or cumulative values over time."
    goals = ["trend"]
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["temporal", "quantitative"],
        ["quantitative", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "any"},
        "y": {"type": "quantitative"},
    }

    optional: Dict[str, Any] = {
        "color": {"type": "nominal"},
    }

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

        # Determine x type based on data
        x_type = "temporal"
        if values:
            first_x = values[0].get(x_field)
            if isinstance(first_x, (int, float)):
                x_type = "quantitative"

        encoding: Dict[str, Any] = {
            "x": {"field": x_field, "type": x_type},
            "y": {"field": y_field, "type": "quantitative"},
        }

        if params.get("color"):
            encoding["color"] = {"field": params["color"], "type": "nominal"}

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {"type": "area", "line": True, "opacity": 0.7},
            "encoding": encoding,
        }

