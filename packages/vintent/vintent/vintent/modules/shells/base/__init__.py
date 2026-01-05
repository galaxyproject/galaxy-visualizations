from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, TypedDict, Union

from vintent.modules.process import Process
from vintent.modules.profiler import DatasetProfile
from vintent.modules.schemas import FieldType

VEGA_LITE_SCHEMA = "https://vega.github.io/schema/vega-lite/v5.json"

EncodingMapType = Dict[str, "EncodingSpecType"]
RendererType = Literal["vega-lite"]
ShellParamsType = Dict[str, Any]


class BaseShell:
    """
    Base class for all visualization shells.

    All attributes are class-level configuration.
    Attributes defaulting to None must be normalized by consumers.
    Shells are static strategy definitions, not stateful objects.
    """

    description: Optional[str] = None

    # metadata
    optional: Optional[EncodingMapType] = None
    required: Optional[EncodingMapType] = None
    semantics: Literal["rowwise", "aggregate"] = "rowwise"
    signatures: Optional[List[List[FieldType]]] = None

    # processes
    process_transform: Optional[Process] = None
    process_finalize: Optional[Process] = None

    def is_applicable(self, profile: DatasetProfile) -> bool:
        if not self.signatures:
            return True

        fields_by_type: Dict[str, List[str]] = {}
        for name, meta in profile.get("fields", {}).items():
            t = meta.get("type") or "nominal"
            fields_by_type.setdefault(t, []).append(name)

        for sig in self.signatures:
            needed: Dict[str, int] = {}
            for t in sig:
                needed[t] = needed.get(t, 0) + 1

            ok = True
            for t, n in needed.items():
                if t == "any":
                    if sum(len(v) for v in fields_by_type.values()) < n:
                        ok = False
                        break
                else:
                    if len(fields_by_type.get(t, [])) < n:
                        ok = False
                        break

            if ok:
                return True

        return False


class EncodingSpecType(TypedDict, total=False):
    aggregate: Union[bool, str]
    bin: bool
    type: FieldType
