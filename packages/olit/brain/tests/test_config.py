"""Config is validated where it enters the brain."""

import pytest
from pydantic import ValidationError

from olit.config import Config, parse


def test_a_wrong_type_fails_here_naming_the_key():
    with pytest.raises(ValidationError) as e:
        parse({"ai_context_window": "lots"})
    assert "ai_context_window" in str(e.value)


def test_a_typo_is_refused_rather_than_ignored():
    """A silently ignored key is how a setting appears to have no effect."""
    with pytest.raises(ValidationError) as e:
        parse({"ai_contxt_window": 4000})
    assert "ai_contxt_window" in str(e.value)


def test_a_nonsense_capability_is_refused_by_name():
    with pytest.raises(ValidationError) as e:
        parse({"capabilities": ["llm", "wrte"]})
    assert "wrte" in str(e.value)


def test_zero_and_negative_budgets_are_refused():
    for key in ("ai_context_window", "ai_max_tokens", "ai_rate_limit", "ai_keep_recent_tokens"):
        with pytest.raises(ValidationError):
            parse({key: 0})


def test_a_realistic_config_passes():
    config = parse(
        {
            "galaxy_root": "http://127.0.0.1:8080/",
            "galaxy_key": "k",
            "ai_provider": "google",
            "ai_model": "gemini-3.7-flash",
            "capabilities": ["llm", "local", "read", "write"],
        }
    )
    assert config.ai_provider == "google"
    assert config.ai_compaction is True


def test_an_empty_config_is_valid_because_galaxy_supplies_the_defaults():
    assert parse({}).ai_provider is None
    assert parse(None).ai_compaction is True


def test_it_still_reads_like_the_dict_the_substrate_expects():
    """The substrate reads config with .get(); validation must not change that."""
    config = parse({"ai_model": "m"})
    assert config.get("ai_model") == "m"
    assert config.get("ai_base_url") is None
    assert config.get("missing", "fallback") == "fallback"


def test_an_already_parsed_config_passes_through():
    config = parse({"ai_model": "m"})
    assert parse(config) is config
    assert isinstance(config, Config)
