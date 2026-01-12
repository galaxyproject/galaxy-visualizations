import logging
import os

logger = logging.getLogger(__name__)

MESSAGE_INITIAL = "Hi, I can a pick a tool for you."
PROMPT_DEFAULT = "Choose and parameterize one of the provided tools. YOU MUST choose a tool!"


env = {
    "AI_API_KEY": None,
    "AI_BASE_URL": "http://localhost:11434/v1",
    # "AI_BASE_URL": "http://localhost:8080/api/plugins/vintent",
    "AI_MODEL": None,
    "AI_RATE_LIMIT": None,  # Requests per minute (e.g., "30")
    # Combined pipeline (fast, 3 LLM calls) or sequential pipeline (reliable, 4 LLM calls)
    # Use sequential (False) for local/smaller models that struggle with parallel tool calling
    "AI_PIPELINE_COMBINE": False,
    "GALAXY_KEY": None,
    "GALAXY_ROOT": "http://localhost:8080/",
}

for key in env:
    env[key] = os.environ.get(key) or env[key]

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
