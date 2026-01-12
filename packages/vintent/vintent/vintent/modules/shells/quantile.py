from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.quantiles import PROCESS_ID as quantiles_id
from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class QuantileShell(BaseShell):
    name = "Quantile Plot"
    description = "Visualize quantiles of a quantitative field, optionally grouped by category."
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: List[List[FieldType]] = [
        ["quantitative"],
        ["nominal", "quantitative"],
    ]

    required: Dict[str, Any] = {
        "field": {"type": "quantitative"},
    }

    optional: Dict[str, Any] = {
        "group_by": {"type": "nominal"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        fields = profile.get("fields", {})
        return any(v.get("type") == "quantitative" for v in fields.values())

    def processes(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ):
        return [
            {
                "id": quantiles_id,
                "params": {
                    "field": params["field"],
                    "group_by": params.get("group_by"),
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

        encoding: Dict[str, Any] = {
            "x": {
                "field": "q",
                "type": "quantitative",
                "title": "Quantile",
            },
            "y": {
                "field": "value",
                "type": "quantitative",
                "title": params["field"],
            },
        }

        if params.get("group_by"):
            encoding["color"] = {
                "field": "group",
                "type": "nominal",
                "title": params["group_by"],
            }

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {"type": "line", "point": True},
            "encoding": encoding,
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        del params  # Unused - validation is based on quantiles process output fields
        fields = profile.get("fields", {})

        if not {"q", "value"}.issubset(fields):
            return {
                "ok": False,
                "errors": [{"code": "missing_quantile_fields"}],
                "warnings": [],
            }

        if fields["q"].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "q_not_quantitative"}],
                "warnings": [],
            }

        if fields["value"].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "value_not_quantitative"}],
                "warnings": [],
            }

        return {"ok": True, "errors": [], "warnings": []}
