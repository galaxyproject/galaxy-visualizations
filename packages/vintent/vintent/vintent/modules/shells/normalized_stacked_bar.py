from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.group_aggregate import PROCESS_ID as group_aggregate_id
from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class NormalizedStackedBarShell(BaseShell):
    name = "Normalized Stacked Bar Chart"
    description = (
        "Show relative composition by stacking categories and normalizing each bar to 100%. "
        "Useful for comparing proportions rather than absolute values."
    )

    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: List[List[FieldType]] = [
        ["nominal", "nominal", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "nominal"},
        "color": {"type": "nominal"},
        "metric": {"type": "quantitative"},
        "op": {
            "enum": ["sum", "mean", "count"],
        },
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        fields = profile.get("fields", {})
        nom = sum(v.get("type") == "nominal" for v in fields.values())
        quant = any(v.get("type") == "quantitative" for v in fields.values())
        return nom >= 2 and quant

    def processes(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ):
        return [
            {
                "id": group_aggregate_id,
                "params": {
                    "group_by": params["x"],
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

        x = params["x"]
        color = params["color"]
        op = params["op"]
        metric = params.get("metric") or "count"
        y_field = metric if op != "count" else "count"

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "transform": [
                {
                    "joinaggregate": [{"op": "sum", "field": y_field, "as": "group_total"}],
                    "groupby": [x],
                },
                {
                    "calculate": f"datum.{y_field} / datum.group_total",
                    "as": "fraction",
                },
            ],
            "mark": {"type": "bar"},
            "encoding": {
                "x": {"field": x, "type": "nominal"},
                "y": {
                    "field": "fraction",
                    "type": "quantitative",
                    "axis": {"format": ".0%"},
                    "stack": "normalize",
                    "title": "Proportion",
                },
                "color": {"field": color, "type": "nominal"},
                "tooltip": [
                    {"field": x, "type": "nominal"},
                    {"field": color, "type": "nominal"},
                    {
                        "field": "fraction",
                        "type": "quantitative",
                        "format": ".1%",
                        "title": "Proportion",
                    },
                ],
            },
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        if params.get("op") == "count":
            if "count" not in fields:
                return {
                    "ok": False,
                    "errors": [{"code": "missing_count_field"}],
                    "warnings": [],
                }
        else:
            metric = params.get("metric")
            if not metric or metric not in fields:
                return {
                    "ok": False,
                    "errors": [{"code": "invalid_metric"}],
                    "warnings": [],
                }

        return {"ok": True, "errors": [], "warnings": []}
