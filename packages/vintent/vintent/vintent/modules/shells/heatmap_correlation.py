from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.finalize.correlation_matrix import PROCESS_ID as correlation_matrix_id
from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class HeatmapCorrelationShell(BaseShell):
    name = "Correlation Heatmap"
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: List[List[FieldType]] = [
        ["quantitative", "quantitative"],
    ]

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        return sum(1 for f in profile.get("fields", {}).values() if f.get("type") == "quantitative") >= 2

    def process_finalize(self, params: ShellParamsType):
        return [
            {
                "id": correlation_matrix_id,
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
            "encoding": {
                "x": {"field": "x", "type": "nominal"},
                "y": {"field": "y", "type": "nominal"},
                "color": {
                    "field": "value",
                    "type": "quantitative",
                    "scale": {"scheme": "redblue", "domain": [-1, 1]},
                },
                "tooltip": [
                    {"field": "x", "type": "nominal"},
                    {"field": "y", "type": "nominal"},
                    {"field": "value", "type": "quantitative", "format": ".2f"},
                ],
            },
            "mark": {"type": "rect"},
        }

    def validate(
        self,
        params: ShellParamsType,
        profile: DatasetProfile,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        if not {"x", "y", "value"}.issubset(fields):
            return {
                "errors": [{"code": "missing_derived_fields"}],
                "ok": False,
                "warnings": [],
            }

        if fields["value"].get("type") != "quantitative":
            return {
                "errors": [{"code": "invalid_value_type"}],
                "ok": False,
                "warnings": [],
            }

        return {"errors": [], "ok": True, "warnings": []}
