from __future__ import annotations

from typing import Any, Dict, List, Literal

from ..schemas import DatasetProfile, FieldType, ValidationResult
from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class LineTimeShell(BaseShell):
    name = "Trend Line"
    description = "Line chart showing values over time with a temporal x-axis."
    goals = ["trend"]
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["temporal", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "temporal"},
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
            "x": {"field": params.get("x", ""), "type": "temporal"},
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
            "mark": {"type": "line"},
        }

