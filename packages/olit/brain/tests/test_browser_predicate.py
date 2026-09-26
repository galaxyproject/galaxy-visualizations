"""One answer to "am I the interpreter in the page".

Three places decided it separately -- two on sys.platform, one by importing pyodide_js -- so
they could disagree about one fact. Whatever the answer, every caller must get the same one.
"""

import pathlib
import sys

from olit.substrate import browser


def test_the_predicate_follows_the_platform():
    assert browser.in_browser() == (sys.platform == "emscripten")


def test_it_is_false_in_the_test_environment():
    """These tests are CPython; a true answer here would pick the browser's fetch."""
    assert browser.in_browser() is False


def test_nothing_else_decides_it_for_itself():
    """A second spelling is a second answer; the drift this replaced."""
    root = pathlib.Path(browser.__file__).resolve().parents[1]
    strays = []
    for path in root.rglob("*.py"):
        if path.name == "browser.py" or "registry/skills" in str(path):
            continue
        text = path.read_text()
        if "emscripten" in text or "import pyodide_js" in text:
            strays.append(str(path.relative_to(root)))
    assert not strays, f"these decide the runtime for themselves: {strays}"


def test_the_callers_agree_with_it():
    from olit.drivers.loop.galaxy_tools import DATA_DIR
    from olit.substrate.http import BrowserHttpClient, http

    assert (DATA_DIR == "/data") is browser.in_browser()
    assert isinstance(http, BrowserHttpClient) is browser.in_browser()
