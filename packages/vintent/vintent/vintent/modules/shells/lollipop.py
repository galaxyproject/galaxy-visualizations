from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.group_aggregate import PROCESS_ID as group_aggregate_id
from vintent.modules.schemas import DatasetProfile, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class LollipopShell(BaseShell):
    name = "Lollipop Chart"
    description = "A cleaner alternative to bar charts, showing values as dots on stems."
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures = [
        ["nominal", "quantitative"],
    ]

    required = {
        "category": {"type": "nominal"},
        "value": {"type": "quantitative"},
        "op": {
            "enum": ["mean", "sum", "min", "max", "count"],
        },
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        fields = profile.get("fields", {})
        has_nominal = any(v.get("type") == "nominal" for v in fields.values())
        has_quant = any(v.get("type") == "quantitative" for v in fields.values())
        return has_nominal and has_quant

    def processes(self, profile: DatasetProfile, params: ShellParamsType):
        return [
            {
                "id": group_aggregate_id,
                "params": {
                    "group_by": params["category"],
                    "op": params["op"],
                    "metric": params.get("value"),
                },
            }
        ]

    def compile(
        self,
        params: ShellParamsType,
        values: List[Dict[str, Any]],
        renderer: RendererType,
    ) -> Dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        category = params["category"]
        op = params["op"]
        value = params.get("value")
        y_field = value if op != "count" else "count"

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "encoding": {
                "x": {"field": category, "type": "nominal", "sort": "-y"},
                "y": {"field": y_field, "type": "quantitative"},
            },
            "layer": [
                {
                    "mark": {"type": "rule", "strokeWidth": 2},
                },
                {
                    "mark": {"type": "circle", "size": 100},
                },
            ],
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        category = params.get("category")
        op = params.get("op")
        value = params.get("value")

        fields = profile.get("fields", {})

        if not category or category not in fields:
            return {
                "ok": False,
                "errors": [{"code": "missing_required_encoding"}],
                "warnings": [],
            }

        if fields[category].get("type") != "nominal":
            return {
                "ok": False,
                "errors": [{"code": "invalid_field_type"}],
                "warnings": [],
            }

        if op != "count":
            if not value or value not in fields:
                return {
                    "ok": False,
                    "errors": [{"code": "missing_required_encoding"}],
                    "warnings": [],
                }
            if fields[value].get("type") != "quantitative":
                return {
                    "ok": False,
                    "errors": [{"code": "invalid_field_type"}],
                    "warnings": [],
                }

        return {"ok": True, "errors": [], "warnings": []}
