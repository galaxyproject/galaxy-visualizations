"""What the shell hands the brain, validated once at the boundary."""

from typing import ClassVar

from pydantic import BaseModel, Field, field_validator


class Config(BaseModel):
    galaxy_root: str | None = None
    # Headless only: the eval harness authenticates with a key. In the browser Olit has
    # the user's Galaxy session and never carries one.
    galaxy_key: str | None = None
    history_id: str | None = None
    dataset_id: str | None = None
    session_id: str | None = None
    record_page_id: str | None = None

    ai_provider: str | None = None
    ai_base_url: str | None = None
    ai_api_key: str | None = None
    ai_model: str | None = None

    ai_max_tokens: int | None = Field(default=None, gt=0)
    ai_context_window: int | None = Field(default=None, gt=0)
    ai_reserve_tokens: int | None = Field(default=None, gt=0)
    ai_keep_recent_tokens: int | None = Field(default=None, gt=0)
    ai_rate_limit: int | None = Field(default=None, gt=0)
    ai_compaction: bool = True

    capabilities: list[str] | None = None

    # Reject unknown keys, so a typo in a manifest is not silently ignored.
    model_config = {"extra": "forbid"}

    @field_validator("capabilities")
    @classmethod
    def known_capabilities(cls, value):
        if value is None:
            return value
        known = {"llm", "local", "read", "write"}
        unknown = sorted(set(value) - known)
        if unknown:
            raise ValueError(f"unknown capabilities {unknown}; known: {sorted(known)}")
        return value

    # Turn-scoped fields excluded from session identity.
    CONTEXT_FIELDS: ClassVar[tuple[str, ...]] = ("history_id", "dataset_id", "session_id", "record_page_id")

    def identity(self):
        """Return the stable session identity."""
        return {k: v for k, v in self.model_dump().items() if k not in self.CONTEXT_FIELDS}

    def get(self, key, default=None):
        """Dict access, so the substrate can keep reading it the way it always has."""
        return getattr(self, key, default) if getattr(self, key, None) is not None else default


def parse(config):
    """Validate whatever the shell sent; a Config passes through unchanged."""
    return config if isinstance(config, Config) else Config.model_validate(config or {})
