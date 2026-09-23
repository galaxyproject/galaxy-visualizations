"""Tool-call arguments are repaired the way pi repairs them, or reported, never guessed."""

import json

import pytest

from olit.substrate.llm.json_parse import loads_with_repair, repair_json


def test_valid_json_is_untouched():
    assert loads_with_repair('{"code": "a\\nb"}') == {"code": "a\nb"}


def test_raw_newlines_in_a_string_are_escaped():
    assert loads_with_repair('{"code": "import json\nx = 1"}') == {"code": "import json\nx = 1"}


def test_raw_tab_in_a_string_is_escaped():
    assert loads_with_repair('{"code": "a\tb"}') == {"code": "a\tb"}


def test_an_invalid_backslash_escape_is_kept_as_data():
    assert loads_with_repair(r'{"code": "re.match(\d+)"}') == {"code": r"re.match(\d+)"}


def test_a_valid_unicode_escape_survives():
    assert loads_with_repair('{"code": "\\u00e9"}') == {"code": "é"}


def test_a_backslash_at_the_end_of_input_does_not_crash():
    repair_json('{"code": "trailing\\')


def test_control_characters_outside_strings_are_left_alone():
    assert loads_with_repair('{\n  "code": "x"\n}') == {"code": "x"}


def test_truncated_json_still_raises():
    """Half a program must not run. Repair fixes escaping, never completes a value."""
    with pytest.raises(json.JSONDecodeError):
        loads_with_repair('{"code": "import js')


def test_nonsense_raises():
    with pytest.raises(json.JSONDecodeError):
        loads_with_repair("not json at all")
