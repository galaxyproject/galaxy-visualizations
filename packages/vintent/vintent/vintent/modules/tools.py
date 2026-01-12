import logging
from typing import Any, Dict, List, Optional

from .process import Process
from .profiler import DatasetProfile
from .registry import SHELLS

NO_PROCESS_ID = "none"
MAX_SHELLS = 50
MAX_FIELDS_PER_ENCODING = 100

logger = logging.getLogger(__name__)


def build_choose_process_tool(
    processes: Dict[str, Process],
    profile: DatasetProfile,
    context: Any = None,
) -> Dict[str, Any]:
    variants: List[Dict[str, Any]] = [
        {
            "type": "object",
            "properties": {"id": {"const": NO_PROCESS_ID}},
            "required": ["id"],
            "additionalProperties": False,
            "description": (
                "DEFAULT CHOICE. Use original data without preprocessing. "
                "Select this unless the user explicitly asks to filter, sort, sample, or transform the data."
            ),
        }
    ]

    process_descriptions: List[str] = []
    for process_id in sorted(processes.keys()):
        process = processes[process_id]
        schema = process.get("schema")
        if not schema:
            continue
        spec = schema(profile, context)
        if not spec:
            continue
        description = spec.get("description", "")
        variants.append(
            {
                "type": "object",
                "properties": {
                    "id": {"const": spec["id"]},
                    "params": spec["params"],
                },
                "required": ["id", "params"],
                "additionalProperties": False,
                "description": description,
            }
        )
        if description:
            process_descriptions.append(f"- {spec['id']}: {description}")

    # Build a helpful description that lists all available processes
    tool_description = (
        "IMPORTANT: Choose 'none' by default. Only select a preprocessing step "
        "if the user EXPLICITLY requests filtering, sorting, sampling, or data transformation. "
        "Simple visualization requests like 'show histogram of X' or 'plot Y vs Z' do NOT need preprocessing."
    )
    if process_descriptions:
        tool_description += "\n\nAvailable processes:\n" + "\n".join(process_descriptions)

    return {
        "type": "function",
        "function": {
            "name": "choose_process",
            "description": tool_description,
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
    logger.debug(f"Shells: {shell_ids}.")
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


def build_fill_shell_params_tool(
    shell: Any,
    profile: DatasetProfile,
    parsed_intent: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    properties: Dict[str, Any] = {}
    required: List[str] = []
    fields_by_type = _field_names_by_type(profile)

    def prioritize_fields(fields: List[str]) -> List[str]:
        """Reorder fields: shell fields first, extract fields last."""
        if not parsed_intent:
            return fields

        viz_fields = set(parsed_intent.get("shell_fields", []))
        extract_fields = set(parsed_intent.get("extract_fields", []))

        # Three tiers: shell (first), neutral (middle), extract (last)
        viz = [f for f in fields if f in viz_fields]
        neutral = [f for f in fields if f not in viz_fields and f not in extract_fields]
        extract = [f for f in fields if f in extract_fields]

        return viz + neutral + extract

    def fields_for_type(expected_type: str) -> List[str]:
        if expected_type == "any":
            names: List[str] = []
            for v in fields_by_type.values():
                names.extend(v)
            return prioritize_fields(names)
        return prioritize_fields(list(fields_by_type.get(expected_type, [])))

    required_specs = getattr(shell, "required", None) or {}
    for name, spec in required_specs.items():
        if is_encoding_spec(spec):
            if isinstance(spec.get("aggregate"), str):
                continue
            fields = fields_for_type(spec["type"])
            if not fields:
                return None
            if len(fields) > MAX_FIELDS_PER_ENCODING:
                fields = fields[:MAX_FIELDS_PER_ENCODING]
            if name == "values":
                properties[name] = {"type": "array", "items": {"type": "string", "enum": fields}, "minItems": 2}
            else:
                properties[name] = {"type": "string", "enum": fields}
            required.append(name)
        else:
            properties[name] = spec
            required.append(name)
    optional_specs = getattr(shell, "optional", None) or {}
    for name, spec in optional_specs.items():
        if is_encoding_spec(spec):
            fields = fields_for_type(spec["type"])
            if fields:
                if len(fields) > MAX_FIELDS_PER_ENCODING:
                    fields = fields[:MAX_FIELDS_PER_ENCODING]
                properties[name] = {"type": "string", "enum": fields}
        else:
            properties[name] = spec
    # Build description with intent context if available
    base_description = (
        "Fill parameters for the visualization shell. Choose fields the user wants to plot, "
        "not the fields used for data extraction (filtering, sorting, sampling)."
    )

    if parsed_intent:
        shell_fields = parsed_intent.get("shell_fields", [])
        extract_fields = parsed_intent.get("extract_fields", [])
        if shell_fields:
            base_description += f"\n\nFields to use for the shell: {', '.join(shell_fields)}"
        if extract_fields:
            base_description += f"\nFields used for extraction (do NOT use for shell): {', '.join(extract_fields)}"

    return {
        "type": "function",
        "function": {
            "name": "fill_shell_params",
            "description": base_description,
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


def build_parse_intent_tool(profile: DatasetProfile) -> Optional[Dict[str, Any]]:
    """Build a tool for extracting user intent from the request.

    This tool helps the LLM distinguish between:
    - Shell fields: fields to plot in the visualization (e.g., "show regression of X and Y")
    - Extract fields: fields for data extraction (e.g., "for lowest 20 Z")
    """
    all_fields = list(profile.get("fields", {}).keys())

    if not all_fields:
        return None

    return {
        "type": "function",
        "function": {
            "name": "parse_intent",
            "description": (
                "Extract the user's intent from their request. "
                "Identify which fields are for the visualization SHELL versus which fields "
                "are used for data EXTRACTION (filtering, sorting, sampling, ranking). "
                "\n\nExamples:\n"
                "- 'regression of glucose and bmi for lowest 20 ages' -> "
                "shell_fields: [Glucose, BMI], extract_fields: [Age]\n"
                "- 'histogram of income' -> shell_fields: [income], extract_fields: []\n"
                "- 'scatter plot of X vs Y colored by category' -> "
                "shell_fields: [X, Y, category], extract_fields: []\n"
                "- 'bar chart of sales by region for top 10 products' -> "
                "shell_fields: [sales, region], extract_fields: [products]"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "shell_fields": {
                        "type": "array",
                        "items": {"type": "string", "enum": all_fields},
                        "description": (
                            "Fields for the visualization shell. These are the primary "
                            "variables to plot (e.g., X/Y axes, values to chart). "
                            "Include fields mentioned for coloring or grouping."
                        ),
                    },
                    "extract_fields": {
                        "type": "array",
                        "items": {"type": "string", "enum": all_fields},
                        "description": (
                            "Fields for data extraction: filtering, sorting, sampling, or ranking. "
                            "These are NOT for the visualization itself. Examples: "
                            "'top 10 by X', 'where Y > 100', 'lowest 20 Z values', 'sample by W'."
                        ),
                    },
                },
                "required": ["shell_fields", "extract_fields"],
                "additionalProperties": False,
            },
        },
    }
