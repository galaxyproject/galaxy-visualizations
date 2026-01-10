from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.finalize.group_aggregate import PROCESS_ID as group_aggregate_id
from vintent.modules.schemas import DatasetProfile, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class BarAggregateShell(BaseShell):
    name = "Bar Chart (Aggregated)"
    description = "Aggregate a quantitative field by a categorical field and display the result as bars."
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures = [
        ["nominal", "quantitative"],
    ]

    required = {
        "group_by": {"type": "nominal"},
        "metric": {"type": "quantitative"},
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

    def process_finalize(self, params: ShellParamsType):
        return [
            {
                "id": group_aggregate_id,
                "params": {
                    "group_by": params["group_by"],
                    "op": params["op"],
                    "metric": params.get("metric"),
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

        group_by = params["group_by"]
        op = params["op"]
        metric = params.get("metric") or "count"
        y_field = metric if op != "count" else "count"

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": "bar",
            "encoding": {
                "x": {"field": group_by, "type": "nominal"},
                "y": {"field": y_field, "type": "quantitative"},
            },
        }

    def validate(
        self,
        params: ShellParamsType,
        profile: DatasetProfile,
    ) -> ValidationResult:
        group_by = params.get("group_by")
        op = params.get("op")
        metric = params.get("metric")

        fields = profile.get("fields", {})

        if not group_by or group_by not in fields:
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

        if op != "count":
            if not metric or metric not in fields:
                return {
                    "ok": False,
                    "errors": [{"code": "invalid_metric"}],
                    "warnings": [],
                }
            if fields[metric].get("type") != "quantitative":
                return {
                    "ok": False,
                    "errors": [{"code": "metric_not_quantitative"}],
                    "warnings": [],
                }

        return {"ok": True, "errors": [], "warnings": []}
