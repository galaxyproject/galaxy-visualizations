from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.normalize_numeric import PROCESS_ID as normalize_id
from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class ParallelCoordinatesShell(BaseShell):
    name = "Parallel Coordinates"
    description = "Visualize multi-dimensional data with parallel vertical axes."
    goals = ["relationship", "comparison"]
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    signatures: List[List[FieldType]] = [
        ["quantitative", "quantitative", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "dimensions": {"type": "quantitative"},
    }

    optional: Dict[str, Any] = {
        "color": {"type": "nominal"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        fields = profile.get("fields", {})
        quant_count = sum(1 for v in fields.values() if v.get("type") == "quantitative")
        return quant_count >= 3

    def processes(self, profile: DatasetProfile, params: ShellParamsType):
        # Normalize numeric fields for comparable scales
        return [
            {
                "id": normalize_id,
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

        # Get quantitative dimensions
        dimensions = params.get("dimensions", [])
        if isinstance(dimensions, str):
            dimensions = [dimensions]

        # If no dimensions specified, use all numeric fields from first row
        if not dimensions and values:
            dimensions = [k for k, v in values[0].items() if isinstance(v, (int, float)) and not k.endswith("_norm")]

        # Use normalized columns
        norm_dims = [f"{d}_norm" for d in dimensions]

        color_field = params.get("color")

        # Add row index for line grouping
        indexed_values = []
        for i, row in enumerate(values):
            new_row = dict(row)
            new_row["_row_id"] = i
            indexed_values.append(new_row)

        encoding: Dict[str, Any] = {
            "x": {"field": "key", "type": "nominal", "title": "Dimension"},
            "y": {"field": "value", "type": "quantitative", "title": "Normalized Value"},
            "detail": {"field": "_row_id", "type": "nominal"},
        }

        if color_field:
            encoding["color"] = {"field": color_field, "type": "nominal"}

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": indexed_values},
            "transform": [
                {"fold": norm_dims, "as": ["key", "value"]},
            ],
            "mark": {"type": "line", "opacity": 0.5},
            "encoding": encoding,
            "width": 600,
            "height": 400,
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})
        quant_count = sum(1 for v in fields.values() if v.get("type") == "quantitative")

        if quant_count < 3:
            return {
                "errors": [{"code": "not_enough_quantitative_fields"}],
                "ok": False,
                "warnings": [],
            }

        return {"errors": [], "ok": True, "warnings": []}
