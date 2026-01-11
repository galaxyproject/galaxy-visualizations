from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.quantiles import PROCESS_ID as quantiles_id
from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class BoxPlotGroupedShell(BaseShell):
    name = "Grouped Box Plot"
    description = "Compare distributions of a quantitative field across categories."
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: List[List[FieldType]] = [
        ["nominal", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "x": {"type": "nominal"},
        "y": {"type": "quantitative"},
    }

    optional: Dict[str, Any] = {
        "color": {"type": "nominal"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        fields = profile.get("fields", {})
        return any(v.get("type") == "nominal" for v in fields.values()) and any(
            v.get("type") == "quantitative" for v in fields.values()
        )

    def processes(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ):
        return [
            {
                "id": quantiles_id,
                "params": {
                    "field": params["y"],
                    "group_by": params["x"],
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
            "mark": {"type": "boxplot"},
            "encoding": {
                "x": {"field": params["x"], "type": "nominal"},
                "y": {
                    "field": "median",
                    "type": "quantitative",
                },
            },
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        if not {"min", "q1", "median", "q3", "max"}.issubset(fields):
            return {
                "ok": False,
                "errors": [{"code": "missing_quantile_fields"}],
                "warnings": [],
            }

        return {"ok": True, "errors": [], "warnings": []}
