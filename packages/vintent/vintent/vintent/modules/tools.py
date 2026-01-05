from typing import Any, Dict, List, Optional

from .process import Process
from .profiler import DatasetProfile
from .shells import SHELLS

NO_PROCESS_ID = "none"
MAX_SHELLS = 50
MAX_FIELDS_PER_ENCODING = 100


def build_choose_extract_tool(
    extract_processes: Dict[str, Process],
    profile: DatasetProfile,
    context: Any = None,
) -> Dict[str, Any]:
    variants: List[Dict[str, Any]] = [
        {
            "type": "object",
            "properties": {"id": {"const": NO_PROCESS_ID}},
            "required": ["id"],
            "additionalProperties": False,
        }
    ]
    for process_id in sorted(extract_processes.keys()):
        process = extract_processes[process_id]
        schema = process.get("schema")
        if not schema:
            continue
        spec = schema(profile, context)
        if not spec:
            continue
        variants.append(
            {
                "type": "object",
                "properties": {
                    "id": {"const": spec["id"]},
                    "params": spec["params"],
                },
                "required": ["id", "params"],
                "additionalProperties": False,
            }
        )
    return {
        "type": "function",
        "function": {
            "name": "choose_process",
            "description": (
                "Optionally select a single extract step to apply before visualization."
                "Use id=none if no extraction is needed."
            ),
            "parameters": {"oneOf": variants},
        },
    }


def _field_names_by_type(profile: DatasetProfile) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    for name, meta in profile["fields"].items():
        t = meta.get("type") or "nominal"
        out.setdefault(t, []).append(name)
    return out


def build_choose_shell_tool(profile: DatasetProfile) -> Dict[str, Any]:
    compatible_shells: List[Dict[str, str]] = []
    for shell_id in sorted(SHELLS.keys()):
        shell = SHELLS[shell_id]
        if shell.is_applicable(profile):
            description = (getattr(shell, "description", "") or "").strip()
            label = f"{shell_id}: {description}" if description else shell_id
            compatible_shells.append({"id": shell_id, "label": label})
        if len(compatible_shells) >= MAX_SHELLS:
            break
    shell_ids = [s["id"] for s in compatible_shells]
    print(f"[vintent] Compatible shells: {shell_ids}.")
    return {
        "type": "function",
        "function": {
            "name": "choose_shell",
            "description": "Select the most appropriate visualization shell for the user request.",
            "parameters": {
                "type": "object",
                "properties": {
                    "shellId": {
                        "type": "string",
                        "enum": shell_ids,
                        "description": "\n".join(s["label"] for s in compatible_shells),
                    }
                },
                "required": ["shellId"],
                "additionalProperties": False,
            },
        },
    }


def build_fill_shell_params_tool(shell: Any, profile: DatasetProfile) -> Optional[Dict[str, Any]]:
    properties: Dict[str, Any] = {}
    required: List[str] = []
    fields_by_type = _field_names_by_type(profile)

    def fields_for_type(expected_type: str) -> List[str]:
        if expected_type == "any":
            names: List[str] = []
            for v in fields_by_type.values():
                names.extend(v)
            return names
        return list(fields_by_type.get(expected_type, []))

    required_specs = getattr(shell, "required", None) or {}
    for encoding, spec in required_specs.items():
        if is_encoding_spec(spec):
            if isinstance(spec.get("aggregate"), str):
                continue
            fields = fields_for_type(spec["type"])
            if not fields:
                return None
            if len(fields) > MAX_FIELDS_PER_ENCODING:
                fields = fields[:MAX_FIELDS_PER_ENCODING]
            if encoding == "values":
                properties[encoding] = {"type": "array", "items": {"type": "string", "enum": fields}, "minItems": 2}
            else:
                properties[encoding] = {"type": "string", "enum": fields}
                required.append(encoding)

    optional_specs = getattr(shell, "optional", None) or {}
    for encoding, spec in optional_specs.items():
        if is_encoding_spec(spec):
            fields = fields_for_type(spec["type"])
            if fields:
                if len(fields) > MAX_FIELDS_PER_ENCODING:
                    fields = fields[:MAX_FIELDS_PER_ENCODING]
                properties[encoding] = {"type": "string", "enum": fields}

    return {
        "type": "function",
        "function": {
            "name": "fill_shell_params",
            "description": "Fill parameters for the selected visualization shell",
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": False,
            },
        },
    }


def is_encoding_spec(spec: Any) -> bool:
    return isinstance(spec, dict) and "type" in spec and isinstance(spec["type"], str)
