from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class ViolinPlotShell(BaseShell):
    name = "Violin Plot"
    description = "Show the distribution of a quantitative field across categories " "using mirrored density plots."

    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["nominal", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "nominal"},
        "y": {"type": "quantitative"},
    }

    optional: Dict[str, Any] = {
        "color": {"type": "nominal"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
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

        x = params["x"]
        y = params["y"]

        encoding: Dict[str, Any] = {
            "x": {"field": x, "type": "nominal"},
            "y": {
                "aggregate": "density",
                "field": y,
                "type": "quantitative",
                "title": "Density",
            },
            "row": {"field": y, "type": "quantitative"},
        }

        if params.get("color"):
            encoding["color"] = {
                "field": params["color"],
                "type": "nominal",
            }

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "transform": [
                {
                    "density": y,
                    "groupby": [x],
                    "as": [y, "density"],
                }
            ],
            "mark": {"type": "area", "orient": "horizontal"},
            "encoding": {
                "y": {"field": y, "type": "quantitative"},
                "x": {"field": "density", "type": "quantitative", "stack": "center"},
                "row": {"field": x, "type": "nominal"},
            },
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        x = params.get("x")
        y = params.get("y")

        if not x or not y:
            return {
                "ok": False,
                "errors": [{"code": "missing_required_encoding"}],
                "warnings": [],
            }

        if fields.get(x, {}).get("type") != "nominal":
            return {
                "ok": False,
                "errors": [{"code": "x_not_nominal"}],
                "warnings": [],
            }

        if fields.get(y, {}).get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "y_not_quantitative"}],
                "warnings": [],
            }

        return {"ok": True, "errors": [], "warnings": []}
