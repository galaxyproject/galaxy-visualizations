from __future__ import annotations

from typing import Any, Literal

from olit.registry.extensions.vintent.modules.process.analyze.linear_regression import PROCESS_ID as linear_regression_id
from olit.registry.extensions.vintent.modules.schemas import DatasetProfile, FieldType, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class LinearRegressionShell(BaseShell):
    name = "Linear Regression"
    description = "Scatter plot with fitted regression line showing the linear relationship between two variables."
    goals = ["relationship"]
    semantics: Literal["rowwise", "aggregate"] = "aggregate"

    signatures: list[list[FieldType]] = [
        ["quantitative", "quantitative"],
    ]

    required = {
        "x": {"type": "quantitative"},
        "y": {"type": "quantitative"},
    }

    def is_applicable(self, profile: DatasetProfile) -> bool:
        return sum(1 for f in profile.get("fields", {}).values() if f.get("type") == "quantitative") >= 2

    def processes(self, profile: DatasetProfile, params: ShellParamsType):
        return [
            {
                "id": linear_regression_id,
                "params": {
                    "x": params.get("x"),
                    "y": params.get("y"),
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

        x = params["x"]
        y = params["y"]

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "layer": [
                {
                    "mark": {"type": "point"},
                    "encoding": {
                        "x": {"field": x, "type": "quantitative"},
                        "y": {"field": y, "type": "quantitative"},
                    },
                },
                {
                    "mark": {"type": "line", "color": "#E30A17"},
                    "encoding": {
                        "x": {"field": x, "type": "quantitative"},
                        "y": {"field": "yhat", "type": "quantitative"},
                    },
                },
            ],
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        for f in (params.get("x"), params.get("y"), "yhat"):
            if f not in fields or fields[f].get("type") != "quantitative":
                return {
                    "errors": [{"code": "invalid_or_missing_field", "field": f}],
                    "ok": False,
                    "warnings": [],
                }

        return {"errors": [], "ok": True, "warnings": []}
