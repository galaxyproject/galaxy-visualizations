from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.group_aggregate import PROCESS_ID as group_aggregate_id
from vintent.modules.schemas import DatasetProfile, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class TreemapShell(BaseShell):
    name = "Treemap"
    description = "Show hierarchical data as nested rectangles sized by value."
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures = [
        ["nominal", "quantitative"],
        ["nominal"],
    ]

    required = {
        "category": {"type": "nominal"},
    }

    optional = {
        "value": {"type": "quantitative"},
        "op": {
            "enum": ["sum", "mean", "count"],
        },
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        fields = profile.get("fields", {})
        has_nominal = any(v.get("type") == "nominal" for v in fields.values())
        return has_nominal

    def processes(self, profile: DatasetProfile, params: ShellParamsType):
        op = params.get("op", "count")
        return [
            {
                "id": group_aggregate_id,
                "params": {
                    "group_by": params["category"],
                    "op": op,
                    "metric": params.get("value"),
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

        category = params["category"]
        op = params.get("op", "count")
        value = params.get("value")
        size_field = value if op != "count" and value else "count"

        # Vega-Lite doesn't have native treemap, use a square root scaled rect mark
        # This creates a pseudo-treemap effect
        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "transform": [
                {"window": [{"op": "row_number", "as": "index"}]},
                {"calculate": "floor(datum.index / 5)", "as": "row"},
                {"calculate": "datum.index % 5", "as": "col"},
            ],
            "mark": {"type": "rect", "stroke": "white", "strokeWidth": 2},
            "encoding": {
                "x": {"field": "col", "type": "ordinal", "axis": None},
                "y": {"field": "row", "type": "ordinal", "axis": None},
                "color": {"field": category, "type": "nominal", "legend": {"title": category}},
                "size": {"field": size_field, "type": "quantitative"},
                "tooltip": [
                    {"field": category, "type": "nominal"},
                    {"field": size_field, "type": "quantitative"},
                ],
            },
            "width": 400,
            "height": 400,
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        category = params.get("category")
        fields = profile.get("fields", {})

        if not category or category not in fields:
            return {
                "ok": False,
                "errors": [{"code": "missing_required_encoding"}],
                "warnings": [],
            }

        if fields[category].get("type") != "nominal":
            return {
                "ok": False,
                "errors": [{"code": "invalid_field_type"}],
                "warnings": [],
            }

        return {"ok": True, "errors": [], "warnings": []}
