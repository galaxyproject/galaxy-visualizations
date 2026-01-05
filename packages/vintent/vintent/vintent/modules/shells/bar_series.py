from __future__ import annotations

from typing import Any, Dict, List, Literal

from ..schemas import DatasetProfile, FieldType, ValidationResult
from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class BarSeriesShell(BaseShell):
    name = "Multi-Series Bar Chart"
    description = (
        "Compare multiple quantitative fields per row using grouped bars. "
        "Each dataset row becomes a category on the x axis. "
        "Each selected field becomes a colored bar within that category. "
        "This is a rowwise comparison, not an aggregation."
    )

    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["quantitative"],
    ]

    required = {
        "values": {"type": "quantitative"},
    }

    optional = {
        "tooltip": {"type": "any"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        quantitative_fields = [f for f in profile.get("fields", {}).values() if f.get("type") == "quantitative"]
        return len(quantitative_fields) >= 2

    def compile(
        self,
        params: ShellParamsType,
        values: List[Dict[str, Any]],
        renderer: RendererType,
    ) -> Dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        fields: List[str] = params.get("values", [])

        spec: Dict[str, Any] = {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "transform": [
                {"window": [{"op": "row_number", "as": "row_id"}]},
                {"fold": fields, "as": ["series", "value"]},
            ],
            "mark": "bar",
            "encoding": {
                "x": {"field": "row_id", "type": "nominal"},
                "xOffset": {"field": "series", "type": "nominal"},
                "y": {"field": "value", "type": "quantitative"},
                "color": {"field": "series", "type": "nominal"},
            },
        }

        if params.get("tooltip"):
            spec["encoding"]["tooltip"] = {"field": params["tooltip"]}

        return spec

    def validate(
        self,
        params: ShellParamsType,
        profile: DatasetProfile,
    ) -> ValidationResult:
        fields = params.get("values")

        if not isinstance(fields, list) or len(fields) < 2:
            return {
                "errors": [{"code": "not_enough_fields"}],
                "ok": False,
                "warnings": [],
            }

        meta_fields = profile.get("fields", {})

        for f in fields:
            meta = meta_fields.get(f)
            if not meta:
                return {
                    "errors": [
                        {
                            "code": "unknown_field",
                            "details": {"field": f},
                        }
                    ],
                    "ok": False,
                    "warnings": [],
                }

            if meta.get("type") != "quantitative":
                return {
                    "errors": [
                        {
                            "code": "invalid_field_type",
                            "details": {
                                "field": f,
                                "expected": "quantitative",
                                "actual": meta.get("type"),
                            },
                        }
                    ],
                    "ok": False,
                    "warnings": [],
                }

        return {"errors": [], "ok": True, "warnings": []}
