from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.ecdf import PROCESS_ID as ecdf_id
from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class EcdfShell(BaseShell):
    name = "ECDF"
    description = (
        "Empirical cumulative distribution function for a quantitative field. "
        "Shows the fraction of observations below a given value."
    )

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
        return any(v.get("type") == "quantitative" for v in profile.get("fields", {}).values())

    def processes(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ):
        return [
            {
                "id": ecdf_id,
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

        field = params["field"]

        encoding: Dict[str, Any] = {
            "x": {
                "field": field,
                "type": "quantitative",
                "title": field,
            },
            "y": {
                "field": "ecdf",
                "type": "quantitative",
                "title": "ECDF",
                "axis": {"format": ".2f"},
            },
        }

        if params.get("group_by"):
            encoding["color"] = {
                "field": params["group_by"],
                "type": "nominal",
            }

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {
                "type": "line",
                "interpolate": "step-after",
            },
            "encoding": encoding,
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})
        field = params.get("field")

        if not field or field not in fields:
            return {
                "ok": False,
                "errors": [{"code": "invalid_field"}],
                "warnings": [],
            }

        if "ecdf" not in fields:
            return {
                "ok": False,
                "errors": [{"code": "missing_ecdf_field"}],
                "warnings": [],
            }

        if fields[field].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "field_not_quantitative"}],
                "warnings": [],
            }

        if fields["ecdf"].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "ecdf_not_quantitative"}],
                "warnings": [],
            }

        return {"ok": True, "errors": [], "warnings": []}
