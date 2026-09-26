"""What the model is told about Galaxy has to follow what can actually run.

`galaxy_ok` gates six guidance blocks and, when false, states that no Galaxy tool or
workflow can run. It used to be read off the openapi catalog, which only serves the graph
route: the catalog fails on a root without a trailing slash, while every tool tolerates one.
"""

import asyncio

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


def _ok(reachable, ops):
    session = Session.__new__(Session)
    session.substrate = _Substrate(reachable, ops)
    return session._galaxy_ok()


def test_a_reachable_server_with_the_ops_path_is_ready():
    assert _ok(True, True) is True


def test_an_unreachable_server_is_not_ready():
    assert _ok(False, True) is False


def test_a_missing_ops_path_is_not_ready():
    """35 of the 51 Galaxy tools are run by galaxy-ops; without it most of them cannot."""
    assert _ok(True, False) is False


def test_readiness_does_not_consult_the_openapi_catalog():
    """A substrate with no catalog at all still answers, so the two cannot be coupled again."""
    assert _ok(True, True) is True


def test_the_probe_records_an_unreachable_server():
    from olit.substrate.galaxy_http import GalaxyHttp

    class _Manifest:
        def require(self, capability):
            pass

    galaxy = GalaxyHttp({"galaxy_root": "http://127.0.0.1:9"}, _Manifest())
    assert galaxy.reachable() is False, "unprobed must not read as reachable"
    assert asyncio.run(galaxy.probe()) is False
    assert galaxy.reachable() is False
