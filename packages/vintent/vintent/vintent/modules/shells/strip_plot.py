from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class StripPlotShell(BaseShell):
    name = "Strip Plot"
    description = (
        "Strip (dot) plot for visualizing the distribution of a quantitative field, "
        "optionally grouped by a categorical field. Useful for small to medium datasets."
    )
    goals = ["distribution", "outliers"]

    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["quantitative"],
        ["nominal", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "field": {"type": "quantitative"},
    }

    optional: Dict[str, Any] = {
        "group_by": {"type": "nominal"},
        "color": {"type": "nominal"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        return any(v.get("type") == "quantitative" for v in profile.get("fields", {}).values())

    def compile(
        self,
        params: ShellParamsType,
        values: List[Dict[str, Any]],
        renderer: RendererType,
    ) -> Dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        field = params["field"]
        group_by = params.get("group_by")
        color = params.get("color")

        encoding: Dict[str, Any] = {
            "x": {
                "field": field,
                "type": "quantitative",
                "title": field,
            },
            "y": {"value": 0},
        }

        if group_by:
            encoding["y"] = {
                "field": group_by,
                "type": "nominal",
                "title": group_by,
            }

        if color:
            encoding["color"] = {
                "field": color,
                "type": "nominal",
            }

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {
                "type": "point",
                "opacity": 0.7,
                "size": 40,
            },
            "encoding": encoding,
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        field = params.get("field")
        group_by = params.get("group_by")
        color = params.get("color")

        if not field or field not in fields:
            return {
                "ok": False,
                "errors": [{"code": "invalid_field"}],
                "warnings": [],
            }

        if fields[field].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "field_not_quantitative"}],
                "warnings": [],
            }

        if group_by:
            if group_by not in fields:
                return {
                    "ok": False,
                    "errors": [{"code": "invalid_group_by"}],
                    "warnings": [],
                }
            if fields[group_by].get("type") != "nominal":
                return {
                    "ok": False,
                    "errors": [{"code": "group_by_not_nominal"}],
                    "warnings": [],
                }

        if color:
            if color not in fields:
                return {
                    "ok": False,
                    "errors": [{"code": "invalid_color_field"}],
                    "warnings": [],
                }
            if fields[color].get("type") != "nominal":
                return {
                    "ok": False,
                    "errors": [{"code": "color_not_nominal"}],
                    "warnings": [],
                }

        return {"ok": True, "errors": [], "warnings": []}
