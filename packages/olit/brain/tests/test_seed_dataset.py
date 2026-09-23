"""Opening Olit on a dataset names it for the agent; opening it bare says nothing."""

from olit import prompt


def test_the_dataset_is_named_so_a_bare_reference_resolves():
    text = prompt.seed_dataset_block("f2db41e1fa331b3e")
    assert "f2db41e1fa331b3e" in text
    assert "get_dataset_details" in text


def test_no_dataset_adds_no_block():
    assert prompt.seed_dataset_block(None) == ""
    assert prompt.seed_dataset_block("") == ""


def test_the_block_reaches_the_system_text():
    with_seed = prompt.system_text(seed_dataset="abc123")
    without = prompt.system_text()
    assert "abc123" in with_seed
    assert "Starting dataset" not in without


def test_a_bare_start_is_unchanged_by_the_feature():
    """The common case must not pay for the optional one."""
    assert prompt.system_text(seed_dataset=None) == prompt.system_text()
