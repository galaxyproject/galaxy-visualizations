from __future__ import annotations

from typing import Any, Literal

from olit.registry.extensions.vintent.modules.schemas import FieldType

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class AreaChartShell(BaseShell):
    name = "Area Chart"
    description = "Filled area chart for showing trends or cumulative values over time."
    goals = ["trend"]
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: list[list[FieldType]] = [
        ["temporal", "quantitative"],
        ["quantitative", "quantitative"],
    ]

    required: dict[str, Any] = {
        "x": {"type": "any"},
        "y": {"type": "quantitative"},
    }

    optional: dict[str, Any] = {
        "color": {"type": "nominal"},
    }

    def compile(
        self,
        params: ShellParamsType,
        values: list[dict[str, Any]],
        renderer: RendererType,
    ) -> dict[str, Any]:
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

        encoding: dict[str, Any] = {
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

