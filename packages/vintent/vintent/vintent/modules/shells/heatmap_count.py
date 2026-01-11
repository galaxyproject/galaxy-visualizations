from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.group_aggregate import PROCESS_ID as group_aggregate_id

from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class HeatmapCountShell(BaseShell):
    name = "Heatmap (Count)"
    description = (
        "Show counts for combinations of two categorical fields as a heatmap. "
        "Useful for contingency tables and categorical interactions."
    )

    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: List[List[FieldType]] = [
        ["nominal", "nominal"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "nominal"},
        "y": {"type": "nominal"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        fields = profile.get("fields", {})
        return sum(v.get("type") == "nominal" for v in fields.values()) >= 2

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
                    "op": "count",
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
        y = params["y"]

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "transform": [
                {
                    "aggregate": [{"op": "sum", "field": "count", "as": "count"}],
                    "groupby": [x, y],
                }
            ],
            "mark": {"type": "rect"},
            "encoding": {
                "x": {"field": x, "type": "nominal"},
                "y": {"field": y, "type": "nominal"},
                "color": {
                    "field": "count",
                    "type": "quantitative",
                    "legend": {"title": "Count"},
                },
                "tooltip": [
                    {"field": x, "type": "nominal"},
                    {"field": y, "type": "nominal"},
                    {
                        "field": "count",
                        "type": "quantitative",
                        "format": ".0f",
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

        if "count" not in fields:
            return {
                "ok": False,
                "errors": [{"code": "missing_count_field"}],
                "warnings": [],
            }

        if fields["count"].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "count_not_quantitative"}],
                "warnings": [],
            }

        return {"ok": True, "errors": [], "warnings": []}
