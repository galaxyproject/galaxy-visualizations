import logging
import os

logger = logging.getLogger(__name__)

MESSAGE_INITIAL = "Hi! I can create visualizations for your data."
PROMPT_DEFAULT = "Choose and parameterize one of the provided tools. YOU MUST choose a tool!"


def _parse_bool(value: str | None, default: bool) -> bool:
    """Parse a string environment variable to boolean."""
    if value is None:
        return default
    return value.lower() in ("true", "1", "yes")


env = {
    "AI_API_KEY": os.environ.get("AI_API_KEY"),
    "AI_BASE_URL": os.environ.get("AI_BASE_URL") or "http://localhost:11434/v1",
    "AI_MODEL": os.environ.get("AI_MODEL"),
    "AI_RATE_LIMIT": os.environ.get("AI_RATE_LIMIT"),
    # Combined pipeline (fast, 3 LLM calls) or sequential pipeline (reliable, 4 LLM calls)
    # Use sequential (False) for local/smaller models that struggle with parallel tool calling
    "AI_PIPELINE_COMBINE": _parse_bool(os.environ.get("AI_PIPELINE_COMBINE"), default=False),
    "GALAXY_KEY": os.environ.get("GALAXY_KEY"),
    "GALAXY_ROOT": os.environ.get("GALAXY_ROOT") or "http://localhost:8080/",
}

if env["GALAXY_KEY"] is None:
    logger.warning("GALAXY_KEY missing in environment.")

config = {
    "ai_api_key": env["AI_API_KEY"] or env["GALAXY_KEY"],
    "ai_base_url": env["AI_BASE_URL"],
    "ai_model": env["AI_MODEL"],
    "ai_rate_limit": int(env["AI_RATE_LIMIT"]) if env["AI_RATE_LIMIT"] else None,
    "ai_pipeline_combine": env["AI_PIPELINE_COMBINE"],
    "galaxy_root": env["GALAXY_ROOT"],
    "galaxy_key": env["GALAXY_KEY"],
}
