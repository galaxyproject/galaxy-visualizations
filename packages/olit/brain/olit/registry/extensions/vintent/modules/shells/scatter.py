from __future__ import annotations

from typing import Any, Literal

from ..schemas import FieldType
from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class ScatterShell(BaseShell):
    name = "Scatter Plot"
    description = "Scatter plot for exploring relationships between two quantitative fields."
    goals = ["relationship", "outliers"]

    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: list[list[FieldType]] = [
        ["quantitative", "quantitative"],
    ]

    required: dict[str, Any] = {
        "x": {"type": "quantitative"},
        "y": {"type": "quantitative"},
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
            "x": {"field": params.get("x", ""), "type": "quantitative"},
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
            "mark": {"type": "point"},
        }
