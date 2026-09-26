"""Whether this interpreter is the one in the page.

The single answer to the most consequential environmental question olit asks: three places
used to decide it separately, two by platform and one by importing a Pyodide module, so they
could disagree about the same fact.

Not the same question as whether a particular Pyodide API exists -- `local.py` binds
`eval_code_async` and `pyfetch` optionally because it has a fallback for each, which is a
capability check rather than this one.
"""

import sys


def in_browser():
    """True under Pyodide, where the page's fetch, filesystem and shell are what olit has."""
    return sys.platform == "emscripten"
