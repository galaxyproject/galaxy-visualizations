import pytest
from vintent.modules.utility import user_asked_for

def test_returns_false_on_empty_context():
    assert user_asked_for([], ["covariance"]) is False
    assert user_asked_for(None, ["covariance"]) is False

def test_uses_last_user_message_only():
    context = [{"role": "user", "content": "covariance"},{"role": "assistant", "content": "ok"},{"role": "user", "content": "something else"}]
    assert user_asked_for(context, ["covariance"]) is False

def test_matches_exact_keyword():
    context = [{"role": "user", "content": "show covariance"}]
    assert user_asked_for(context, ["covariance"]) is True

def test_matches_single_character_typo():
    context = [{"role": "user", "content": "show covariace"}]
    assert user_asked_for(context, ["covariance"]) is True

def test_matches_single_substitution():
    context = [{"role": "user", "content": "covxariance"}]
    assert user_asked_for(context, ["covariance"]) is True

def test_matches_single_insertion():
    context = [{"role": "user", "content": "scovariance"}]
    assert user_asked_for(context, ["covariance"]) is True

def test_matches_single_deletion():
    context = [{"role": "user", "content": "covariance"}]
    assert user_asked_for(context, ["covariance"]) is True

def test_two_substitutions_do_not_match():
    context = [{"role": "user", "content": "covxxariance"}]
    assert user_asked_for(context, ["covariance"]) is False

def test_substitution_plus_insertion_do_not_match():
    context = [{"role": "user", "content": "scovxariance"}]
    assert user_asked_for(context, ["covariance"]) is False

def test_completely_different_word_does_not_match():
    context = [{"role": "user", "content": "statistics"}]
    assert user_asked_for(context, ["covariance"]) is False

def test_ignores_non_user_roles():
    context = [{"role": "assistant", "content": "covariance"},{"role": "system", "content": "covariance"}]
    assert user_asked_for(context, ["covariance"]) is False

def test_ignores_non_string_content():
    context = [{"role": "user", "content": {"text": "covariance"}}]
    assert user_asked_for(context, ["covariance"]) is False

def test_multiple_keywords_any_match_succeeds():
    context = [{"role": "user", "content": "please compute covar"}]
    assert user_asked_for(context, ["covariance","covar"]) is True
