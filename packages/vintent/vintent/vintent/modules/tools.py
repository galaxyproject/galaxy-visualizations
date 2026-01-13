import logging
from typing import Any, Dict, List, Optional

from .process import Process
from .profiler import DatasetProfile
from .registry import SHELLS

NO_PROCESS_ID = "none"
MAX_SHELLS = 50
MAX_FIELDS_PER_ENCODING = 100

logger = logging.getLogger(__name__)

# Analytical goals taxonomy
ANALYTICAL_GOALS = [
    "distribution",  # How values are spread (histogram, density, box plot, violin)
    "relationship",  # How variables relate to each other (scatter, regression, correlation)
    "comparison",    # Compare values across categories (bar, grouped bar, box plot)
    "composition",   # Parts of a whole (pie, donut, treemap, stacked bar)
    "trend",         # Change over time or sequence (line, area)
    "ranking",       # Ordered/ranked values (sorted bar, lollipop, top-N)
    "summary",       # Aggregate statistics and reports
    "outliers",      # Identify unusual or extreme values
]

GOAL_DESCRIPTIONS = {
    "distribution": "Understand how values are spread or distributed (e.g., 'show distribution of X', 'how is Y distributed', 'histogram')",
    "relationship": "Explore how two or more variables relate (e.g., 'X vs Y', 'correlation between', 'relationship', 'regression')",
    "comparison": "Compare values across different categories or groups (e.g., 'compare X by Y', 'difference between', 'across categories')",
    "composition": "Show parts of a whole or proportions (e.g., 'breakdown of', 'percentage', 'share', 'proportion')",
    "trend": "Show change over time or sequence (e.g., 'over time', 'trend', 'timeline', 'progression')",
    "ranking": "Show ordered or ranked values (e.g., 'top 10', 'highest', 'lowest', 'ranked by')",
    "summary": "Get aggregate statistics or data overview (e.g., 'statistics', 'summary', 'describe', 'overview')",
    "outliers": "Identify unusual or extreme values (e.g., 'outliers', 'anomalies', 'extreme values', 'unusual')",
}


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
                "DEFAULT CHOICE - select this for histogram, distribution, scatter, correlation, bar chart, "
                "line chart, trend, comparison, aggregation, or ANY visualization request that does not "
                "explicitly mention 'top N', 'bottom N', 'filter', 'sample', or 'limit rows'."
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
        "CRITICAL: Choose 'none' for 99% of requests. Only select a preprocessing step "
        "if the user EXPLICITLY uses words like 'top N', 'bottom N', 'filter', 'sort', 'sample', or 'limit'.\n\n"
        "ALWAYS choose 'none' for these request types (no preprocessing needed):\n"
        "- Histogram/distribution: 'show histogram of X', 'distribution of Y', 'how is Z distributed'\n"
        "- Scatter/correlation: 'X vs Y', 'correlation between X and Y', 'relationship'\n"
        "- Bar/comparison: 'compare X by Y', 'X across categories'\n"
        "- Line/trend: 'X over time', 'trend of Y'\n"
        "- Any aggregation: 'average', 'sum', 'count', 'mean', 'total'\n\n"
        "ONLY use a process when the user says things like:\n"
        "- 'top 10 by X' or 'bottom 5 by Y' → rank_top_k\n"
        "- 'filter where X > 100' → range_filter\n"
        "- 'sample 50 rows' → sample_rows"
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


def build_choose_shell_tool(
    profile: DatasetProfile,
    parsed_intent: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build the shell selection tool.

    If parsed_intent is provided with a 'goal', shells matching that goal
    are listed first with a [RECOMMENDED] tag.
    """
    target_goal = parsed_intent.get("goal") if parsed_intent else None
    compatible_shells: List[Dict[str, str]] = []
    recommended_shells: List[Dict[str, str]] = []

    for shell_id in sorted(SHELLS.keys()):
        shell = SHELLS[shell_id]
        if shell.is_applicable(profile):
            description = (getattr(shell, "description", "") or "").strip()
            goals = getattr(shell, "goals", []) or []
            goals_str = f" [goals: {', '.join(goals)}]" if goals else ""
            label = f"{shell_id}: {description}{goals_str}" if description else f"{shell_id}{goals_str}"

            shell_entry = {"id": shell_id, "label": label}

            # Prioritize shells matching the target goal
            if target_goal and target_goal in goals:
                recommended_shells.append(shell_entry)
            else:
                compatible_shells.append(shell_entry)

        if len(recommended_shells) + len(compatible_shells) >= MAX_SHELLS:
            break

    # Combine: recommended shells first, then others
    all_shells = recommended_shells + compatible_shells
    shell_ids = [s["id"] for s in all_shells]
    logger.debug(f"Shells: {shell_ids}. Target goal: {target_goal}")

    # Build description with goal context
    tool_description = "Select the most appropriate visualization shell for the user request."
    if target_goal:
        tool_description += f" The user's analytical goal is '{target_goal}' - prefer shells that support this goal."

    return {
        "type": "function",
        "function": {
            "name": "choose_shell",
            "description": tool_description,
            "parameters": {
                "type": "object",
                "properties": {
                    "shellId": {
                        "type": "string",
                        "enum": shell_ids,
                        "description": "\n".join(s["label"] for s in all_shells),
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

    This tool helps the LLM understand:
    - Goal: The analytical goal (distribution, relationship, comparison, etc.)
    - Shell fields: fields to plot in the visualization
    - Extract fields: fields for data extraction (filtering, sorting, etc.)
    """
    all_fields = list(profile.get("fields", {}).keys())

    if not all_fields:
        return None

    # Build goal descriptions for the enum
    goal_descriptions = "\n".join(
        f"- {goal}: {GOAL_DESCRIPTIONS[goal]}" for goal in ANALYTICAL_GOALS
    )

    return {
        "type": "function",
        "function": {
            "name": "parse_intent",
            "description": (
                "Extract the user's analytical intent from their request. "
                "Identify the GOAL (what kind of insight they want), "
                "which fields are for the visualization SHELL, "
                "and which fields are for data EXTRACTION.\n\n"
                "Examples:\n"
                "- 'show me outliers in salary' -> goal: outliers, shell_fields: [salary]\n"
                "- 'how is age distributed' -> goal: distribution, shell_fields: [age]\n"
                "- 'is there a correlation between X and Y' -> goal: relationship, shell_fields: [X, Y]\n"
                "- 'compare sales across regions' -> goal: comparison, shell_fields: [sales, region]\n"
                "- 'what percentage of users are premium' -> goal: composition, shell_fields: [user_type]\n"
                "- 'show revenue trend over time' -> goal: trend, shell_fields: [revenue, date]\n"
                "- 'top 10 products by sales' -> goal: ranking, shell_fields: [product, sales]\n"
                "- 'give me summary statistics' -> goal: summary, shell_fields: []"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "goal": {
                        "type": "string",
                        "enum": ANALYTICAL_GOALS,
                        "description": (
                            "The analytical goal - what kind of insight does the user want?\n\n"
                            f"{goal_descriptions}"
                        ),
                    },
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
                "required": ["goal", "shell_fields", "extract_fields"],
                "additionalProperties": False,
            },
        },
    }
