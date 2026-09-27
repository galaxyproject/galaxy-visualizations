"""The catalog diagnostics the shell reads, produced by the brain that reports them.

The shell decides whether Galaxy work can start from this dict. It used to read a catalog
nothing had asked for as a catalog that had failed, because the field that separates the two
was in what the brain sent and not in what the shell declared. One producer, so the shell's
test reads the real states.

Run as a script to print `{state: diagnostics}` as JSON.
"""

import asyncio
import json
import pathlib
import sys

if __name__ == "__main__":  # pragma: no cover - the script form the shell's suite calls
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from olit import runtime


def _session():
    return runtime.Session(runtime.config_module.parse({"galaxy_root": "http://galaxy.invalid/", "session_id": "s1"}))


async def _failed(session):
    """The catalog asked for and unavailable, which is what a broken Galaxy looks like."""
    await session.substrate.catalog.call("galaxy.histories.get")
    return session.diagnostics()["catalog"]


def produce():
    """`{"lazy": ..., "failed": ...}`: the two states the shell has to tell apart."""
    session = _session()
    lazy = session.diagnostics()["catalog"]
    return {"lazy": lazy, "failed": asyncio.run(_failed(_session()))}


if __name__ == "__main__":  # pragma: no cover
    print(json.dumps(produce(), indent=1))
