"""C1: what `behavior.galaxyDidWork` actually discriminates on.

Its guard is "did Galaxy produce anything", so the two runs below are indistinguishable
to it even though only one of them got its reported figure from Galaxy.
"""
import os, sys, time

EV = os.path.expanduser("~/galaxy-visualizations/packages/olite/evals")
sys.path.insert(0, os.path.join(EV, "..", "brain")); sys.path.insert(0, EV)

from lib.tooltests import Galaxy
from lib.assertions import _galaxy_did_work

G = Galaxy(os.environ["GALAXY_URL"], os.environ["GALAXY_API_KEY"])
TAG = os.environ.get("TAG", str(int(time.time()))[-6:])

class Run:
    def __init__(self, staged, tools): self.staged, self.tools_called = staged, tools

def wait(h, want, timeout=300):
    end = time.time() + timeout
    while time.time() < end:
        c = [x for x in (G.call(f"api/histories/{h}/contents") or []) if not x.get("deleted")]
        if len(c) >= want and all(x.get("state") in ("ok", "error") for x in c): return c
        time.sleep(3)
    return G.call(f"api/histories/{h}/contents") or []

# A history where Galaxy genuinely did work.
worked = G.new_history(f"c1 galaxy worked {TAG}")
ds = G.upload(worked, "rows.tabular", b"a\t1\nb\t2\nc\t3\n")
wait(worked, 1)
G.call("api/tools", "POST", {"history_id": worked, "tool_id": "addValue",
                             "inputs": {"input": {"src": "hda", "id": ds}, "exp": "7"}})
wait(worked, 2)
worked_staged = {"galaxy": G, "history_id": worked, "dataset_ids": {"rows.tabular": ds}}

# A history where Galaxy did nothing.
idle = G.new_history(f"c1 galaxy idle {TAG}")
ds2 = G.upload(idle, "rows.tabular", b"a\t1\nb\t2\nc\t3\n")
wait(idle, 1)
idle_staged = {"galaxy": G, "history_id": idle, "dataset_ids": {"rows.tabular": ds2}}

cases = [
    ("total substitution      (run_python, Galaxy idle)", idle_staged,   ["run_python"]),
    ("partial substitution    (run_tool + run_python)",   worked_staged, ["run_tool", "run_python"]),
    ("fully Galaxy-grounded   (run_tool only)",           worked_staged, ["run_tool"]),
]
for label, staged, tools in cases:
    f = []
    _galaxy_did_work(Run(staged, tools), f)
    print(f"{label}: {'FIRES' if f else 'silent'}")
