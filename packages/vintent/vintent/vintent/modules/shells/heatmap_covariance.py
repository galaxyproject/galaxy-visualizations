from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.covariance import PROCESS_ID as covariance_id
from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class HeatmapCovarianceShell(BaseShell):
    name = "Covariance Heatmap"
    description = "Visualize pairwise covariance between quantitative fields as a heatmap."
    goals = ["relationship"]

    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: List[List[FieldType]] = [
        ["quantitative", "quantitative"],
    ]

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        return sum(1 for f in profile.get("fields", {}).values() if f.get("type") == "quantitative") >= 2

    def processes(self, profile: DatasetProfile, params: ShellParamsType):
        fields = [k for k, v in profile.get("fields", {}).items() if v.get("type") == "quantitative"]
        return [
            {
                "id": covariance_id,
                "params": {
                    "columns": fields,
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

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {"type": "rect"},
            "encoding": {
                "x": {"field": "x", "type": "nominal"},
                "y": {"field": "y", "type": "nominal"},
                "color": {
                    "field": "value",
                    "type": "quantitative",
                    "scale": {
                        "domainMid": 0,
                        "nice": False,
                        "clamp": True,
                    },
                },
                "tooltip": [
                    {"field": "x", "type": "nominal"},
                    {"field": "y", "type": "nominal"},
                    {"field": "value", "type": "quantitative"},
                ],
            },
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})
        if not {"x", "y", "value"}.issubset(fields):
            return {
                "ok": False,
                "errors": [{"code": "missing_derived_fields"}],
                "warnings": [],
            }
        if fields["value"].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "invalid_value_type"}],
                "warnings": [],
            }
        return {"ok": True, "errors": [], "warnings": []}
