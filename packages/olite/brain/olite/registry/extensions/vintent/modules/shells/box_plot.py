from __future__ import annotations

from typing import Any, Dict, List, Literal

from ..schemas import DatasetProfile, FieldType, ValidationResult
from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class BoxPlotShell(BaseShell):
    name = "Box Plot"
    description = "Show distribution with quartiles, median, and outliers for a quantitative field grouped by category."
    goals = ["distribution", "comparison", "outliers"]
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: List[List[FieldType]] = [
        ["nominal", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "nominal"},
        "y": {"type": "quantitative"},
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
            "x": {"field": params.get("x", ""), "type": "nominal"},
            "y": {"field": params.get("y", ""), "type": "quantitative"},
        }

        if params.get("color"):
            encoding["color"] = {"field": params["color"], "type": "nominal"}

        if params.get("tooltip"):
            encoding["tooltip"] = {"field": params["tooltip"]}

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "encoding": encoding,
            "mark": {"type": "boxplot"},
        }

