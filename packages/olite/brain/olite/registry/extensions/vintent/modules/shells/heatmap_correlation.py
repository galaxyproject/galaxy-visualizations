from __future__ import annotations

from typing import Any, Literal

from olite.registry.extensions.vintent.modules.process.analyze.correlation_matrix import PROCESS_ID as correlation_matrix_id
from olite.registry.extensions.vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class HeatmapCorrelationShell(BaseShell):
    name = "Correlation Heatmap"
    description = (
        "Visualize pairwise correlations across many quantitative fields as a heatmap. "
        "Best for high dimensional numeric datasets."
    )
    goals = ["relationship"]
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: list[list[FieldType]] = [
        ["quantitative", "quantitative"],
    ]

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        return sum(1 for f in profile.get("fields", {}).values() if f.get("type") == "quantitative") >= 2

    def processes(self, profile: DatasetProfile, params: ShellParamsType):
        return [
            {
                "id": correlation_matrix_id,
                "params": {},
            }
        ]

    def compile(
        self,
        params: ShellParamsType,
        values: list[dict[str, Any]],
        renderer: RendererType,
    ) -> dict[str, Any]:
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
        profile: DatasetProfile,
        params: ShellParamsType,
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
