from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.group_aggregate import PROCESS_ID as group_aggregate_id
from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class BarCountShell(BaseShell):
    name = "Bar Chart (Count)"
    description = "Count rows per category and display as bars."
    goals = ["comparison", "ranking", "distribution"]
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: List[List[FieldType]] = [
        ["nominal"],
    ]

    required: Dict[str, Any] = {
        "group_by": {"type": "nominal"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        return any(v.get("type") == "nominal" for v in profile.get("fields", {}).values())

    def processes(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ):
        return [
            {
                "id": group_aggregate_id,
                "params": {
                    "group_by": params["group_by"],
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

        group_by = params["group_by"]

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": "bar",
            "encoding": {
                "x": {
                    "field": group_by,
                    "type": "nominal",
                    "title": group_by,
                },
                "y": {
                    "field": "count",
                    "type": "quantitative",
                    "title": "Count",
                    "axis": {"format": ".0f"},
                },
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
