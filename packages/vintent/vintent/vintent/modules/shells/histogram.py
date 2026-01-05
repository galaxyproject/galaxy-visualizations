from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.finalize.compute_bins import PROCESS_ID as compute_bins_id
from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class HistogramShell(BaseShell):
    name = "Histogram"
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: List[List[FieldType]] = [
        ["quantitative"],
    ]

    required = {
        "field": {"type": "quantitative"},
    }

    optional: Dict[str, Any] = {
        "tooltip": {"type": "any"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not super().is_applicable(profile):
            return False
        return any(meta.get("type") == "quantitative" for meta in profile.get("fields", {}).values())

    def process_finalize(self, params: ShellParamsType):
        field = params.get("field")
        if not field:
            return []
        return [
            {
                "id": compute_bins_id,
                "params": {
                    "field": field,
                },
            }
        ]

    def validate(
        self,
        params: ShellParamsType,
        profile: DatasetProfile,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        if "bin_start" not in fields or "bin_end" not in fields or "count" not in fields:
            return {
                "errors": [{"code": "missing_derived_fields"}],
                "ok": False,
                "warnings": [],
            }

        if fields["count"].get("type") != "quantitative":
            return {
                "errors": [{"code": "invalid_count_type"}],
                "ok": False,
                "warnings": [],
            }

        return {"errors": [], "ok": True, "warnings": []}

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
                    "calculate": ("format(datum.bin_start, '.2f') + ' – ' + " "format(datum.bin_end, '.2f')"),
                    "as": "bin_label",
                }
            ],
            "encoding": {
                "x": {
                    "field": "bin_label",
                    "type": "nominal",
                    "title": params.get("field", "Value"),
                    "sort": {
                        "field": "bin_start",
                        "order": "ascending",
                    },
                },
                "y": {
                    "field": "count",
                    "type": "quantitative",
                    "title": "Count",
                    "axis": {"format": ".0f"},
                },
                "tooltip": [
                    {
                        "field": "bin_start",
                        "type": "quantitative",
                        "title": "Bin start",
                        "format": ".2f",
                    },
                    {
                        "field": "bin_end",
                        "type": "quantitative",
                        "title": "Bin end",
                        "format": ".2f",
                    },
                    {
                        "field": "count",
                        "type": "quantitative",
                        "title": "Count",
                        "format": ".0f",
                    },
                ],
            },
            "mark": {"type": "bar"},
        }
