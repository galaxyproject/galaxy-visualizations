from __future__ import annotations

from typing import Any, Dict, List, Literal

from ..schemas import DatasetProfile, FieldType, ValidationResult
from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class DensityShell(BaseShell):
    name = "Density Plot"
    description = "Show the probability distribution of a continuous variable as a smooth curve."
    goals = ["distribution"]
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: List[List[FieldType]] = [
        ["quantitative"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "quantitative"},
    }

    optional: Dict[str, Any] = {
        "color": {"type": "nominal"},
        "tooltip": {"type": "any"},
    }

    def compile(
        self,
        params: ShellParamsType,
        values: List[Dict[str, Any]],
        renderer: RendererType,
    ) -> Dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        encoding: Dict[str, Any] = {
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

