"""What a turn reports about tokens and cost, exercising the code that does it.

Providers disagree on the key names and some report only a total, so this is read from every
reply. It was previously checked by a test that reimplemented the arithmetic, which could not
notice the production code changing.
"""

import pytest

from olit.drivers.loop.agent import _add_usage


def _fold(*replies):
    usage = {"input": 0, "output": 0, "cost": None}
    logs = []
    for reported in replies:
        _add_usage(usage, reported, logs)
    return usage, logs


@pytest.mark.parametrize(
    "reported,expect_in,expect_out",
    [
        ({"prompt_tokens": 10, "completion_tokens": 4}, 10, 4),
        ({"input_tokens": 7, "output_tokens": 3}, 7, 3),
        ({"total_tokens": 12}, 0, 12),
        ({}, 0, 0),
        (None, 0, 0),
    ],
)
def test_usage_keys_vary_by_provider(reported, expect_in, expect_out):
    """Reading only prompt_tokens/completion_tokens silently shows nothing elsewhere."""
    usage, _ = _fold(reported)
    assert (usage["input"], usage["output"]) == (expect_in, expect_out)


def test_a_turn_sums_every_reply():
    usage, _ = _fold({"prompt_tokens": 10, "completion_tokens": 4}, {"prompt_tokens": 5, "completion_tokens": 1})
    assert (usage["input"], usage["output"]) == (15, 5)


def test_cost_stays_none_until_a_provider_prices_the_call():
    assert _fold({"prompt_tokens": 1})[0]["cost"] is None
    assert _fold({"cost": 0.25}, {"cost": 0.25})[0]["cost"] == 0.5
    # A priced reply among unpriced ones still lands, rather than being lost to the None.
    assert _fold({"prompt_tokens": 1}, {"cost": 0.5})[0]["cost"] == 0.5


def test_a_silent_provider_is_stated_rather_than_read_as_zero():
    _, logs = _fold({})
    assert any("provider reported none" in line for line in logs)
    _, logs = _fold({"total_tokens": 3})
    assert not logs, "a provider that answered should not be reported silent"
