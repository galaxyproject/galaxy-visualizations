from __future__ import annotations

from typing import Any, Literal

from olite.registry.extensions.vintent.modules.process.analyze.density_estimate import PROCESS_ID as density_id
from olite.registry.extensions.vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class ViolinPlotShell(BaseShell):
    name = "Violin Plot"
    description = "Show the distribution of a quantitative field across categories " "using mirrored density plots."
    goals = ["distribution", "comparison"]

    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: list[list[FieldType]] = [
        ["nominal", "quantitative"],
    ]

    required: dict[str, Any] = {
        "x": {"type": "nominal"},
        "y": {"type": "quantitative"},
    }

    optional: dict[str, Any] = {
        "color": {"type": "nominal"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
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
                "id": density_id,
                "params": {
                    "group_by": params["x"],
                    "field": params["y"],
                },
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
            "mark": {
                "type": "area",
                "orient": "horizontal",
                "interpolate": "monotone",
            },
            "encoding": {
                "y": {
                    "field": "value",
                    "type": "quantitative",
                    "title": params["y"],
                },
                "x": {
                    "field": "density",
                    "type": "quantitative",
                    "stack": "center",
                    "axis": None,
                },
                "color": {
                    "field": "group",
                    "type": "nominal",
                    "title": params["x"],
                },
            },
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        del params  # Unused - validation is based on density_estimate output fields
        fields = profile.get("fields", {})

        if not {"value", "density", "group"}.issubset(fields):
            return {
                "ok": False,
                "errors": [{"code": "missing_density_fields"}],
                "warnings": [],
            }

        if fields["value"].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "value_not_quantitative"}],
                "warnings": [],
            }

        if fields["density"].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "density_not_quantitative"}],
                "warnings": [],
            }

        return {"ok": True, "errors": [], "warnings": []}
