"""The tool under test and the brain it reports on are both siblings of this directory."""

import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
for path in (HERE, HERE.parent / "brain"):
    sys.path.insert(0, str(path))
