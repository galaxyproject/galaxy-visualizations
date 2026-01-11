from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class ECDFShell(BaseShell):
    name = "ECDF"
    description = (
        "Empirical cumulative distribution function for a quantitative field. "
        "Shows the fraction of observations below a given value."
    )

    semantics: Literal["rowwise", "aggregate"] = "rowwise"

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

    def compile(
        self,
        params: ShellParamsType,
        values: List[Dict[str, Any]],
        renderer: RendererType,
    ) -> Dict[str, Any]:
        if renderer != "vega-lite":
            return {}

        field = params["field"]
        group_by = params.get("group_by")

        transform = [
            {
                "window": [{"op": "count", "as": "n"}],
            },
            {
                "window": [
                    {"op": "rank", "as": "rank"},
                ],
                "sort": [{"field": field, "order": "ascending"}],
            },
            {
                "calculate": "datum.rank / datum.n",
                "as": "ecdf",
            },
        ]

        if group_by:
            transform[0]["groupby"] = [group_by]
            transform[1]["groupby"] = [group_by]

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

        if group_by:
            encoding["color"] = {
                "field": group_by,
                "type": "nominal",
            }

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "transform": transform,
            "mark": {"type": "line", "interpolate": "step-after"},
            "encoding": encoding,
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        field = params.get("field")
        group_by = params.get("group_by")

        if not field or field not in fields:
            return {
                "ok": False,
                "errors": [{"code": "invalid_field"}],
                "warnings": [],
            }

        if fields[field].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "field_not_quantitative"}],
                "warnings": [],
            }

        if group_by:
            if group_by not in fields:
                return {
                    "ok": False,
                    "errors": [{"code": "invalid_group_by"}],
                    "warnings": [],
                }
            if fields[group_by].get("type") != "nominal":
                return {
                    "ok": False,
                    "errors": [{"code": "group_by_not_nominal"}],
                    "warnings": [],
                }

        return {"ok": True, "errors": [], "warnings": []}
