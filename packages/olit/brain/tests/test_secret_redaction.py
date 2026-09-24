"""A key the session holds must not ride a tool result into the transcript."""

from olit.drivers.loop.secret_redaction import (
    MIN_SECRET_LEN,
    REDACTED,
    collect_secret_values,
    redact_secrets,
)

CONFIG = {
    "ai_api_key": "sk-or-v1-9f3a2b7c4d1e",
    "galaxy_key": "fea4130124bb18ef",
    "ai_model": "gpt-oss-120b",
    "galaxy_root": "http://galaxy/",
}


def test_only_credential_values_are_collected():
    assert collect_secret_values(CONFIG) == ["fea4130124bb18ef", "sk-or-v1-9f3a2b7c4d1e"]


def test_a_short_value_is_never_treated_as_a_secret():
    """Scrubbing a 3-char value would mangle ordinary output."""
    assert collect_secret_values({"ai_api_key": "abc"}) == []
    assert redact_secrets("abc appears often", ["abc"]) == "abc appears often"


def test_a_key_printed_by_a_tool_is_scrubbed():
    secrets = collect_secret_values(CONFIG)
    said = "GALAXY_API_KEY=fea4130124bb18ef\nOPENAI=sk-or-v1-9f3a2b7c4d1e"
    out = redact_secrets(said, secrets)
    assert "fea4130124bb18ef" not in out
    assert "sk-or-v1-9f3a2b7c4d1e" not in out
    assert out.count(REDACTED) == 2


def test_a_longer_key_containing_a_shorter_one_is_scrubbed_whole():
    """Longest-first, or the shorter match would split the longer key."""
    secrets = ["abcdefgh", "abcdefgh-ijklmnop"]
    assert redact_secrets("token abcdefgh-ijklmnop here", secrets) == f"token {REDACTED} here"


def test_ordinary_output_is_untouched():
    assert redact_secrets("133 lines written", collect_secret_values(CONFIG)) == "133 lines written"


def test_the_minimum_length_is_loom_s():
    assert MIN_SECRET_LEN == 8


def test_the_validated_config_the_runtime_builds_is_read():
    """The runtime hands the driver a Config, not a dict; a dict-only check read nothing."""
    from olit import config as config_module

    validated = config_module.parse({"ai_api_key": "sk-or-v1-9f3a2b7c4d1e", "galaxy_key": "fea4130124bb18ef"})
    assert collect_secret_values(validated) == ["fea4130124bb18ef", "sk-or-v1-9f3a2b7c4d1e"]
