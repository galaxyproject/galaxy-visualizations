"""A read of a resource the watcher owns buys nothing until it can say something new."""

from olit.loop.galaxy_poll_guard import COOLDOWN_SECONDS, GalaxyPollGuard

WATCHED = [{"kind": "dataset", "id": "d1", "state": "running"}]


class Clock:
    """A clock a test moves, so a cooldown is asserted rather than waited out."""

    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_the_first_read_of_a_watched_resource_goes_through():
    guard = GalaxyPollGuard(WATCHED, Clock())

    assert guard.check("get_dataset_details", {"dataset_id": "d1"}) is None


def test_a_second_read_inside_the_cooldown_is_refused():
    guard = GalaxyPollGuard(WATCHED, Clock())
    guard.check("get_dataset_details", {"dataset_id": "d1"})

    refusal = guard.check("get_dataset_details", {"dataset_id": "d1"})

    assert refusal is not None
    assert "running" in refusal
    assert "background monitor is watching it" in refusal


def test_the_read_is_useful_again_once_the_cooldown_expires():
    clock = Clock()
    guard = GalaxyPollGuard(WATCHED, clock)
    guard.check("get_dataset_details", {"dataset_id": "d1"})

    clock.now += COOLDOWN_SECONDS
    assert guard.check("get_dataset_details", {"dataset_id": "d1"}) is None


def test_a_resource_the_watcher_is_not_following_is_never_held():
    """Settlement is the watcher's to decide: what it dropped is finished, and readable."""
    guard = GalaxyPollGuard(WATCHED, Clock())

    for _ in range(3):
        assert guard.check("get_dataset_details", {"dataset_id": "settled"}) is None


def test_each_resource_cools_down_on_its_own():
    watched = WATCHED + [{"kind": "dataset", "id": "d2", "state": "queued"}]
    guard = GalaxyPollGuard(watched, Clock())
    guard.check("get_dataset_details", {"dataset_id": "d1"})

    assert guard.check("get_dataset_details", {"dataset_id": "d2"}) is None
    assert guard.check("get_dataset_details", {"dataset_id": "d1"}) is not None


def test_a_call_that_reads_no_watched_resource_is_left_alone():
    guard = GalaxyPollGuard(WATCHED, Clock())

    assert guard.check("get_history_contents", {"history_id": "h1"}) is None
    assert guard.check("get_dataset_details", {}) is None


def test_the_job_behind_a_watched_dataset_cools_down_with_it():
    """`get_job_details` asks by dataset id, so it reads the same resource."""
    guard = GalaxyPollGuard(WATCHED, Clock())
    guard.check("get_dataset_details", {"dataset_id": "d1"})

    assert guard.check("get_job_details", {"dataset_id": "d1"}) is not None


def test_an_invocation_is_keyed_by_its_own_argument():
    guard = GalaxyPollGuard([{"kind": "invocation", "id": "i1", "state": "new"}], Clock())
    guard.check("get_invocations", {"invocation_id": "i1"})

    assert guard.check("get_invocations", {"invocation_id": "i1"}) is not None
