import logging
import os

logger = logging.getLogger(__name__)

MESSAGE_INITIAL = "Hi, I can a pick a tool for you."
PROMPT_DEFAULT = "Choose and parameterize one of the provided tools. YOU MUST choose a tool!"


env = {
    "AI_API_KEY": None,
    # "AI_BASE_URL": "http://localhost:11434/v1",
    "AI_BASE_URL": "http://localhost:8080/api/plugins/vintent",
    "AI_MODEL": None,
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
    "galaxy_root": env["GALAXY_ROOT"],
    "galaxy_key": env["GALAXY_KEY"],
}
