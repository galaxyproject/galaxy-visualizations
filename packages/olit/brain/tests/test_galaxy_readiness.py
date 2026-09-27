"""What the model is told about Galaxy has to follow what can actually run.

The status gates six guidance blocks and picks the notice. It used to be read off the openapi
catalog, which only serves the graph route: the catalog fails on a root without a trailing
slash, while every tool tolerates one. It is a status rather than a flag because the two
failures leave different tools working, and the notice used to claim neither did.
"""

import asyncio

from olit import prompt
from olit.runtime import Session


class _Galaxy:
    def __init__(self, reachable):
        self._reachable = reachable

    def reachable(self):
        return self._reachable


class _Ops:
    def __init__(self, available):
        self._available = available

    def available(self):
        return self._available


class _Substrate:
    def __init__(self, reachable=True, ops=True):
        self.galaxy = _Galaxy(reachable)
        self.ops = _Ops(ops)


def _status(reachable, ops):
    session = Session.__new__(Session)
    session.substrate = _Substrate(reachable, ops)
    return session._galaxy_status()


def test_a_reachable_server_with_the_ops_path_is_ready():
    assert _status(True, True) == prompt.GALAXY_READY


def test_an_unreachable_server_is_not_ready():
    assert _status(False, True) == prompt.GALAXY_UNREACHABLE


def test_a_missing_ops_path_is_told_apart_from_an_unreachable_server():
    """35 of the 51 Galaxy tools are run by galaxy-ops; the other 16 reach Galaxy themselves and
    still work, so this state is not the one where nothing runs."""
    assert _status(True, False) == prompt.OPS_UNAVAILABLE


def test_readiness_does_not_consult_the_openapi_catalog():
    """A substrate with no catalog at all still answers, so the two cannot be coupled again."""
    assert _status(True, True) == prompt.GALAXY_READY


def test_each_state_gets_the_notice_that_is_true_of_it():
    """The notice claimed no Galaxy tool could run. In the ops-unavailable state 16 still can,
    so saying so cost the agent every tool it had left."""
    unreachable = " ".join(prompt.system_text(galaxy_status=prompt.GALAXY_UNREACHABLE).split())
    assert "## Galaxy: NOT AVAILABLE" in unreachable
    assert "Nothing you propose can execute" in unreachable

    partly = " ".join(prompt.system_text(galaxy_status=prompt.OPS_UNAVAILABLE).split())
    assert "## Galaxy: PARTLY AVAILABLE" in partly
    assert "`run_tool`" in partly
    assert "Nothing you propose can execute" not in partly

    assert "Galaxy: NOT AVAILABLE" not in prompt.system_text()
    assert "Galaxy: PARTLY AVAILABLE" not in prompt.system_text()


def test_the_probe_records_an_unreachable_server():
    from olit.substrate.galaxy_http import GalaxyHttp

    class _Manifest:
        def require(self, capability):
            pass

    galaxy = GalaxyHttp({"galaxy_root": "http://127.0.0.1:9"}, _Manifest())
    assert galaxy.reachable() is False, "unprobed must not read as reachable"
    assert asyncio.run(galaxy.probe()) is False
    assert galaxy.reachable() is False
