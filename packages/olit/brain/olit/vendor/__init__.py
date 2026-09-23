"""Contracts owned by another repo, vendored so the brain can read them offline."""

import functools
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent


@functools.cache
def galaxy_charts_inputs() -> dict:
    """What each galaxy-charts input type stores, and where its options come from."""
    return json.loads((HERE / "galaxy-charts.inputs.json").read_text())
