"""Tests for configuration validation."""

import pytest
from pydantic import ValidationError

from polaris.config import PolarisConfig


class TestPolarisConfig:
    """Tests for PolarisConfig validation."""

    def test_default_config(self):
        """Test config with defaults."""
        config = PolarisConfig()
        assert config.ai_base_url == "http://localhost:11434/v1/"
        assert config.galaxy_root == "http://localhost:8080/"
        assert config.ai_rate_limit == 30  # Default rate limit

    def test_url_validation_adds_trailing_slash(self):
        """Test URLs get trailing slash added."""
        config = PolarisConfig(
            ai_base_url="http://example.com",
            galaxy_root="https://galaxy.org"
        )
        assert config.ai_base_url == "http://example.com/"
        assert config.galaxy_root == "https://galaxy.org/"

    def test_url_validation_normalizes_trailing_slash(self):
        """Test URLs with trailing slash are normalized."""
        config = PolarisConfig(
            ai_base_url="http://example.com///",
            galaxy_root="https://galaxy.org//"
        )
        assert config.ai_base_url == "http://example.com/"
        assert config.galaxy_root == "https://galaxy.org/"

    def test_invalid_url_raises(self):
        """Test invalid URL format raises error."""
        with pytest.raises(ValidationError) as exc_info:
            PolarisConfig(ai_base_url="not-a-url")
        assert "URL must start with http://" in str(exc_info.value)

    def test_invalid_rate_limit_raises(self):
        """Test rate limit must be positive."""
        with pytest.raises(ValidationError):
            PolarisConfig(ai_rate_limit=0)

        with pytest.raises(ValidationError):
            PolarisConfig(ai_rate_limit=-1)

    def test_valid_rate_limit(self):
        """Test valid rate limit."""
        config = PolarisConfig(ai_rate_limit=30)
        assert config.ai_rate_limit == 30

    def test_effective_ai_api_key_prefers_ai_key(self):
        """Test effective_ai_api_key prefers AI_API_KEY."""
        config = PolarisConfig(ai_api_key="ai-key", galaxy_key="galaxy-key")
        assert config.effective_ai_api_key == "ai-key"

    def test_effective_ai_api_key_falls_back_to_galaxy(self):
        """Test effective_ai_api_key falls back to galaxy_key."""
        config = PolarisConfig(galaxy_key="galaxy-key")
        assert config.effective_ai_api_key == "galaxy-key"

    def test_to_dict(self):
        """Test to_dict returns expected structure."""
        config = PolarisConfig(
            ai_api_key="test-key",
            ai_model="gpt-4",
            ai_rate_limit=60,
        )
        d = config.to_dict()
        assert d["ai_api_key"] == "test-key"
        assert d["ai_model"] == "gpt-4"
        assert d["ai_rate_limit"] == 60
        assert d["galaxy_root"] == "http://localhost:8080/"
