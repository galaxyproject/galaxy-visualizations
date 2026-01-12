from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class BoxPlotGroupedShell(BaseShell):
    name = "Grouped Box Plot"
    description = "Compare distributions of a quantitative field across categories with optional color grouping."
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
        if not super().is_applicable(profile):
            return False
        fields = profile.get("fields", {})
        return any(v.get("type") == "nominal" for v in fields.values()) and any(
            v.get("type") == "quantitative" for v in fields.values()
        )

    def compile(
        self,
        params: ShellParamsType,
        values: List[Dict[str, Any]],
        renderer: RendererType,
    ) -> Dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        encoding: Dict[str, Any] = {
            "x": {"field": params["x"], "type": "nominal"},
            "y": {"field": params["y"], "type": "quantitative"},
        }

        if params.get("color"):
            encoding["color"] = {"field": params["color"], "type": "nominal"}

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {"type": "boxplot"},
            "encoding": encoding,
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})
        x_field = params.get("x")
        y_field = params.get("y")

        if not x_field or not y_field:
            return {
                "ok": False,
                "errors": [{"code": "missing_required_encoding"}],
                "warnings": [],
            }

        if x_field not in fields or y_field not in fields:
            return {
                "ok": False,
                "errors": [{"code": "unknown_field"}],
                "warnings": [],
            }

        if fields[x_field].get("type") != "nominal":
            return {
                "ok": False,
                "errors": [{"code": "x_not_nominal"}],
                "warnings": [],
            }

        if fields[y_field].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "y_not_quantitative"}],
                "warnings": [],
            }

        return {"ok": True, "errors": [], "warnings": []}
