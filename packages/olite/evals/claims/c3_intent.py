"""C3: lineage is intact whichever in-history input a job consumes.

One history, two plausible staged inputs, a job deliberately run on the wrong one.
"""
import os, sys, time

EV = os.path.expanduser("~/galaxy-visualizations/packages/olite/evals")
sys.path.insert(0, os.path.join(EV, "..", "brain")); sys.path.insert(0, EV)

from lib.tooltests import Galaxy
from lib.assertions import _lineage_intact

G = Galaxy(os.environ["GALAXY_URL"], os.environ["GALAXY_API_KEY"])
TAG = os.environ.get("TAG", str(int(time.time()))[-6:])

class Run:
    def __init__(self, staged): self.staged = staged

def wait(h, want, timeout=300):
    end = time.time() + timeout
    while time.time() < end:
        c = [x for x in (G.call(f"api/histories/{h}/contents") or []) if not x.get("deleted")]
        if len(c) >= want and all(x.get("state") in ("ok", "error") for x in c): return c
        time.sleep(3)
    return G.call(f"api/histories/{h}/contents") or []

h = G.new_history(f"c3 intent {TAG}")
intended = G.upload(h, "gold_medals.tabular", b"USA\t39\nCHN\t38\nJPN\t27\n")
distractor = G.upload(h, "silver_medals.tabular", b"USA\t41\nCHN\t32\nJPN\t14\n")
wait(h, 2)
print(f"history {h}\n  intended   gold_medals   {intended}\n  distractor silver_medals {distractor}\n")

staged = {"galaxy": G, "history_id": h,
          "dataset_ids": {"gold_medals.tabular": intended, "silver_medals.tabular": distractor}}

# The job the user did not ask for: same history, wrong input.
G.call("api/tools", "POST", {"history_id": h, "tool_id": "addValue",
                             "inputs": {"input": {"src": "hda", "id": distractor}, "exp": "7"}})
wait(h, 3)

found = []
_lineage_intact(Run(staged), found)
print("lineageIntact after consuming the distractor:",
      "silent -> BLIND" if not found else [f.detail for f in found])

# What Galaxy does record, independently of any transcript:
out = [c for c in (G.call(f"api/histories/{h}/contents") or [])
       if c["id"] not in (intended, distractor) and not c.get("deleted")]
for c in out:
    d = G.call(f"api/datasets/{c['id']}") or {}
    job = G.call(f"api/jobs/{d.get('creating_job')}?full=true") or {}
    ins = {k: v.get("id") for k, v in (job.get("inputs") or {}).items() if isinstance(v, dict)}
    print(f"output {c['name']!r} <- job inputs {ins}")
    print("  reaches intended staged id:", intended in ins.values())
