from __future__ import annotations

from typing import Any, Literal

from olit.registry.extensions.vintent.modules.process.analyze.cardinality_report import (
    PROCESS_ID as cardinality_report_id,
)
from olit.registry.extensions.vintent.modules.schemas import DatasetProfile, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class CardinalityReportShell(BaseShell):
    name = "Column Cardinality"
    description = "Show the number of unique values per column."
    goals = ["summary"]
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures = [
        ["nominal", "quantitative"],
    ]

    def is_applicable(self, profile: DatasetProfile) -> bool:
        return bool(profile.get("fields"))

    def processes(self, profile: DatasetProfile, params: ShellParamsType):
        return [
            {
                "id": cardinality_report_id,
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
            "mark": "bar",
            "encoding": {
                "x": {"field": "column", "type": "nominal", "sort": "-y"},
                "y": {"field": "unique", "type": "quantitative"},
                "tooltip": [
                    {"field": "column", "type": "nominal"},
                    {"field": "unique", "type": "quantitative"},
                ],
            },
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        absent = [name for name in ("column", "unique") if name not in fields]
        if absent:
            return {
                "ok": False,
                "errors": [{"code": "missing_derived_field", "details": {"field": ", ".join(absent)}}],
                "warnings": [],
            }

        if fields["unique"].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [
                    {
                        "code": "invalid_derived_field_type",
                        "details": {
                            "field": "unique",
                            "expected": "quantitative",
                            "actual": fields["unique"].get("type"),
                        },
                    }
                ],
                "warnings": [],
            }

        return {"ok": True, "errors": [], "warnings": []}
