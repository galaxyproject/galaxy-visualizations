from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.finalize.summary_statistics import PROCESS_ID as summary_statistics_id
from vintent.modules.schemas import DatasetProfile, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class SummaryStatisticsShell(BaseShell):
    name = "Summary Statistics"
    description = "Show basic summary statistics for each numeric column."
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures = [
        ["nominal", "quantitative"],
    ]

    def is_applicable(self, profile: DatasetProfile) -> bool:
        fields = profile.get("fields", {})
        return any(v.get("type") == "quantitative" for v in fields.values())

    def process_finalize(self, profile: DatasetProfile, params: ShellParamsType):
        return [
            {
                "id": summary_statistics_id,
                "params": {},
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

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "transform": [
                {
                    "fold": ["mean", "median", "std", "min", "max"],
                    "as": ["statistic", "value"],
                }
            ],
            "mark": "bar",
            "encoding": {
                "x": {
                    "field": "column",
                    "type": "nominal",
                    "axis": {"labelAngle": -45},
                },
                "xOffset": {"field": "statistic", "type": "nominal"},
                "y": {"field": "value", "type": "quantitative"},
                "color": {"field": "statistic", "type": "nominal"},
                "tooltip": [
                    {"field": "column", "type": "nominal"},
                    {"field": "statistic", "type": "nominal"},
                    {"field": "value", "type": "quantitative"},
                ],
            },
        }

    def validate(
        self,
        params: ShellParamsType,
        profile: DatasetProfile,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        if not {"column", "mean", "median", "std", "min", "max"}.issubset(fields):
            return {
                "ok": False,
                "errors": [{"code": "missing_summary_fields"}],
                "warnings": [],
            }

        for k in ["mean", "median", "std", "min", "max"]:
            if fields[k].get("type") != "quantitative":
                return {
                    "ok": False,
                    "errors": [{"code": "invalid_stat_type", "details": {"field": k}}],
                    "warnings": [],
                }

        return {"ok": True, "errors": [], "warnings": []}
