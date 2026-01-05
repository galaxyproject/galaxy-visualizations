from __future__ import annotations

from typing import Any, Dict, List, Literal

from ..schemas import DatasetProfile, FieldType, ValidationResult
from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class ScatterShell(BaseShell):
    name = "Scatter Plot"
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["quantitative", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "quantitative"},
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

    def validate(
        self,
        params: ShellParamsType,
        profile: DatasetProfile,
    ) -> ValidationResult:
        x_field = params.get("x")
        y_field = params.get("y")

        if not x_field or not y_field:
            return {
                "errors": [{"code": "missing_required_encoding"}],
                "ok": False,
                "warnings": [],
            }

        fields = profile.get("fields", {})
        x_meta = fields.get(x_field)
        y_meta = fields.get(y_field)

        if not x_meta or not y_meta:
            return {
                "errors": [{"code": "unknown_field"}],
                "ok": False,
                "warnings": [],
            }

        if x_meta.get("type") != "quantitative" or y_meta.get("type") != "quantitative":
            return {
                "errors": [
                    {
                        "code": "invalid_field_type",
                        "details": {
                            "encoding": {
                                "x": x_field,
                                "y": y_field,
                            },
                            "expected": {
                                "x": "quantitative",
                                "y": "quantitative",
                            },
                            "actual": {
                                "x": x_meta.get("type"),
                                "y": y_meta.get("type"),
                            },
                        },
                    }
                ],
                "ok": False,
                "warnings": [],
            }

        return {"errors": [], "ok": True, "warnings": []}
