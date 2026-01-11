from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.pca import PROCESS_ID as pca_id
from vintent.modules.schemas import DatasetProfile, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


class PCAShell(BaseShell):
    name = "PCA Scatter"
    description = "Project data into principal component space and visualize PC1 vs PC2."
    semantics: Literal["rowwise", "aggregate"] = "rowwise"

    def is_applicable(self, profile: DatasetProfile) -> bool:
        fields = profile.get("fields", {})
        return sum(1 for v in fields.values() if v.get("type") == "quantitative") >= 2

    def processes(self, profile: DatasetProfile, params: ShellParamsType):
        columns = [k for k, v in profile.get("fields", {}).items() if v.get("type") == "quantitative"]
        return [
            {
                "id": pca_id,
                "params": {
                    "columns": columns,
                    "n_components": 2,
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

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": values},
            "mark": {"type": "point"},
            "encoding": {
                "x": {"field": "PC1", "type": "quantitative"},
                "y": {"field": "PC2", "type": "quantitative"},
                "tooltip": [
                    {"field": "PC1", "type": "quantitative"},
                    {"field": "PC2", "type": "quantitative"},
                ],
            },
        }

    def validate(
        self,
        profile: DatasetProfile,
        params: ShellParamsType,
    ) -> ValidationResult:
        fields = profile.get("fields", {})

        if not {"PC1", "PC2"}.issubset(fields):
            return {
                "ok": False,
                "errors": [{"code": "missing_pca_components"}],
                "warnings": [],
            }

        if fields["PC1"].get("type") != "quantitative" or fields["PC2"].get("type") != "quantitative":
            return {
                "ok": False,
                "errors": [{"code": "invalid_pca_type"}],
                "warnings": [],
            }

        return {"ok": True, "errors": [], "warnings": []}
