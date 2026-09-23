from __future__ import annotations

from typing import Any, Literal

from ..schemas import FieldType
from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class DensityShell(BaseShell):
    name = "Density Plot"
    description = "Show the probability distribution of a continuous variable as a smooth curve."
    goals = ["distribution"]
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: list[list[FieldType]] = [
        ["quantitative"],
    ]

    required: dict[str, Any] = {
        "x": {"type": "quantitative"},
    }

    optional: dict[str, Any] = {
        "color": {"type": "nominal"},
        "tooltip": {"type": "any"},
    }

    def compile(
        self,
        params: ShellParamsType,
        values: list[dict[str, Any]],
        renderer: RendererType,
    ) -> dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        encoding: dict[str, Any] = {
            "x": {"field": "value", "type": "quantitative"},
            "y": {"field": "density", "type": "quantitative"},
        }

        if params.get("color"):
            encoding["color"] = {"field": params["color"], "type": "nominal"}

        if params.get("tooltip"):
            encoding["tooltip"] = {"field": params["tooltip"]}

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "transform": [
                {
                    "density": params.get("x", ""),
                    "as": ["value", "density"],
                }
            ],
            "encoding": encoding,
            "mark": {"type": "area"},
        }

