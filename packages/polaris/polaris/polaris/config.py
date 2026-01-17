"""Configuration management for Polaris.

Loads configuration from environment variables with validation.
"""

import logging
import os
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


class PolarisConfig(BaseModel):
    """Validated configuration for Polaris."""

    ai_api_key: Optional[str] = Field(default=None, description="API key for AI provider")
    ai_base_url: str = Field(default="http://localhost:11434/v1/", description="Base URL for AI API")
    ai_model: Optional[str] = Field(default=None, description="AI model to use")
    ai_rate_limit: int = Field(default=30, ge=1, description="Rate limit for LLM requests (per minute)")
    galaxy_root: str = Field(default="http://localhost:8080/", description="Galaxy server URL")
    galaxy_key: Optional[str] = Field(default=None, description="Galaxy API key")

    @field_validator("ai_base_url", "galaxy_root")
    @classmethod
    def validate_url(cls, v: str) -> str:
        """Validate URL format."""
        if not v.startswith(("http://", "https://")):
            raise ValueError(f"URL must start with http:// or https://, got: {v}")
        return v.rstrip("/") + "/"

    @model_validator(mode="after")
    def validate_api_key_available(self) -> "PolarisConfig":
        """Warn if no API key is available."""
        if self.ai_api_key is None and self.galaxy_key is None:
            logger.warning("No API key configured (AI_API_KEY or GALAXY_KEY)")
        return self

    @property
    def effective_ai_api_key(self) -> Optional[str]:
        """Get the effective AI API key (falls back to galaxy_key)."""
        return self.ai_api_key or self.galaxy_key

    def to_dict(self) -> dict:
        """Convert to dictionary for backward compatibility."""
        return {
            "ai_api_key": self.effective_ai_api_key,
            "ai_base_url": self.ai_base_url,
            "ai_model": self.ai_model,
            "ai_rate_limit": self.ai_rate_limit,
            "galaxy_root": self.galaxy_root,
            "galaxy_key": self.galaxy_key,
        }


def load_config() -> PolarisConfig:
    """Load configuration from environment variables.

    Environment variables:
        AI_API_KEY: API key for AI provider
        AI_BASE_URL: Base URL for AI API (default: http://localhost:11434/v1/)
        AI_MODEL: AI model to use
        AI_RATE_LIMIT: Rate limit in requests per minute
        GALAXY_ROOT: Galaxy server URL (default: http://localhost:8080/)
        GALAXY_KEY: Galaxy API key

    Returns:
        Validated PolarisConfig instance.

    Raises:
        pydantic.ValidationError: If configuration is invalid.
    """
    return PolarisConfig(
        ai_api_key=os.environ.get("AI_API_KEY"),
        ai_base_url=os.environ.get("AI_BASE_URL") or "http://localhost:11434/v1/",
        ai_model=os.environ.get("AI_MODEL"),
        ai_rate_limit=int(os.environ["AI_RATE_LIMIT"]) if os.environ.get("AI_RATE_LIMIT") else 30,
        galaxy_root=os.environ.get("GALAXY_ROOT") or "http://localhost:8080/",
        galaxy_key=os.environ.get("GALAXY_KEY"),
    )
