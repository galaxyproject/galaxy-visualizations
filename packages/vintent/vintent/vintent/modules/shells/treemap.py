from __future__ import annotations

from typing import Any, Dict, List, Literal

from vintent.modules.process.analyze.group_aggregate import PROCESS_ID as group_aggregate_id
from vintent.modules.schemas import DatasetProfile, ValidationResult

from .base import VEGA_LITE_SCHEMA, BaseShell, RendererType, ShellParamsType


def _squarify_layout(
    values: List[Dict[str, Any]],
    size_field: str,
    x: float = 0,
    y: float = 0,
    width: float = 400,
    height: float = 400,
) -> List[Dict[str, Any]]:
    """Compute treemap layout using simplified squarify algorithm."""
    if not values:
        return []

    # Get sizes and filter out non-positive values
    items = []
    for v in values:
        size = v.get(size_field)
        if isinstance(size, (int, float)) and size > 0:
            items.append({**v, "_size": float(size)})

    if not items:
        return []

    # Sort by size descending for better layout
    items.sort(key=lambda x: x["_size"], reverse=True)

    total = sum(item["_size"] for item in items)
    if total <= 0:
        return []

    # Normalize sizes to fit the area
    area = width * height
    for item in items:
        item["_norm_size"] = (item["_size"] / total) * area

    result: List[Dict[str, Any]] = []
    _squarify_recurse(items, x, y, width, height, result)
    return result


def _squarify_recurse(
    items: List[Dict[str, Any]],
    x: float,
    y: float,
    width: float,
    height: float,
    result: List[Dict[str, Any]],
) -> None:
    """Recursively layout items using squarify algorithm."""
    if not items:
        return

    if len(items) == 1:
        item = items[0]
        result.append({**item, "x": x, "y": y, "x2": x + width, "y2": y + height})
        return

    # Determine layout direction (lay out along shorter edge)
    vertical = width >= height

    total_size = sum(item["_norm_size"] for item in items)
    row: List[Dict[str, Any]] = []
    row_size = 0.0

    for i, item in enumerate(items):
        # Try adding item to current row
        test_row = row + [item]
        test_size = row_size + item["_norm_size"]

        if vertical:
            row_width = test_size / height if height > 0 else 0
            worst_ratio = _worst_ratio(test_row, row_width, vertical)
        else:
            row_height = test_size / width if width > 0 else 0
            worst_ratio = _worst_ratio(test_row, row_height, vertical)

        if row and worst_ratio > _worst_ratio(
            row,
            row_size / height if vertical else row_size / width,
            vertical,
        ):
            # Layout current row and recurse on remaining
            if vertical:
                row_width = row_size / height if height > 0 else 0
                _layout_row(row, x, y, row_width, height, vertical, result)
                _squarify_recurse(items[i:], x + row_width, y, width - row_width, height, result)
            else:
                row_height = row_size / width if width > 0 else 0
                _layout_row(row, x, y, width, row_height, vertical, result)
                _squarify_recurse(items[i:], x, y + row_height, width, height - row_height, result)
            return

        row = test_row
        row_size = test_size

    # Layout final row
    if row:
        if vertical:
            row_width = row_size / height if height > 0 else width
            _layout_row(row, x, y, row_width, height, vertical, result)
        else:
            row_height = row_size / width if width > 0 else height
            _layout_row(row, x, y, width, row_height, vertical, result)


def _worst_ratio(row: List[Dict[str, Any]], side: float, vertical: bool) -> float:
    """Calculate worst aspect ratio in a row."""
    if not row or side <= 0:
        return float("inf")

    worst = 0.0
    for item in row:
        size = item["_norm_size"]
        other_side = size / side if side > 0 else 0
        ratio = max(side / other_side, other_side / side) if other_side > 0 else float("inf")
        worst = max(worst, ratio)
    return worst


def _layout_row(
    row: List[Dict[str, Any]],
    x: float,
    y: float,
    width: float,
    height: float,
    vertical: bool,
    result: List[Dict[str, Any]],
) -> None:
    """Layout a row of items."""
    offset = 0.0
    total = sum(item["_norm_size"] for item in row)

    for item in row:
        fraction = item["_norm_size"] / total if total > 0 else 0

        if vertical:
            item_height = height * fraction
            result.append({
                **item,
                "x": x,
                "y": y + offset,
                "x2": x + width,
                "y2": y + offset + item_height,
            })
            offset += item_height
        else:
            item_width = width * fraction
            result.append({
                **item,
                "x": x + offset,
                "y": y,
                "x2": x + offset + item_width,
                "y2": y + height,
            })
            offset += item_width


class TreemapShell(BaseShell):
    name = "Treemap"
    description = "Show hierarchical data as nested rectangles sized by value."
    goals = ["composition"]
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

        # Compute treemap layout with squarify algorithm using normalized coordinates (0-1)
        layout_values = _squarify_layout(values, size_field, 0, 0, 1, 1)

        return {
            "$schema": VEGA_LITE_SCHEMA,
            "data": {"values": layout_values},
            "mark": {"type": "rect", "stroke": "white", "strokeWidth": 2},
            "encoding": {
                "x": {"field": "x", "type": "quantitative", "axis": None, "scale": {"domain": [0, 1]}},
                "x2": {"field": "x2"},
                "y": {"field": "y", "type": "quantitative", "axis": None, "scale": {"domain": [0, 1]}},
                "y2": {"field": "y2"},
                "color": {"field": category, "type": "nominal", "legend": {"title": category}},
                "tooltip": [
                    {"field": category, "type": "nominal"},
                    {"field": size_field, "type": "quantitative", "title": size_field},
                ],
            },
            "width": "container",
            "height": "container",
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
