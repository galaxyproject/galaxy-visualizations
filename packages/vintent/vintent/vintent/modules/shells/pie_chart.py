from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.group_aggregate import PROCESS_ID as group_aggregate_id
from vintent.modules.schemas import DatasetProfile, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class PieChartShell(BaseShell):
    name = "Pie Chart"
    description = "Show proportions of categories as slices of a pie."
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures = [
        ["nominal", "quantitative"],
        ["nominal"],
    ]

    required = {
        "category": {"type": "nominal"},
    }

    optional = {
        "value": {"type": "quantitative"},
        "op": {
            "enum": ["sum", "mean", "count"],
        },
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        fields = profile.get("fields", {})
        has_nominal = any(v.get("type") == "nominal" for v in fields.values())
        return has_nominal

    def processes(self, profile: DatasetProfile, params: ShellParamsType):
        op = params.get("op", "count")
        return [
            {
                "id": group_aggregate_id,
                "params": {
                    "group_by": params["category"],
                    "op": op,
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
        op = params.get("op", "count")
        value = params.get("value")
        theta_field = value if op != "count" and value else "count"

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {"type": "arc"},
            "encoding": {
                "theta": {"field": theta_field, "type": "quantitative"},
                "color": {"field": category, "type": "nominal"},
            },
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        category = params.get("category")
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

        return {"ok": True, "errors": [], "warnings": []}
