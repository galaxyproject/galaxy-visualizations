"""C3: `history.descendsFrom` must fire for the distractor and stay silent for the intended input.

Same history, two plausible inputs, one job each. No model.
"""
import os, sys, time

EV = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(EV, "..", "brain")); sys.path.insert(0, EV)

from lib.tooltests import Galaxy
from lib.assertions import _descends_from, _lineage_intact

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

def run_on(h, ds):
    G.call("api/tools", "POST", {"history_id": h, "tool_id": "addValue",
                                 "inputs": {"input": {"src": "hda", "id": ds}, "exp": "7"}})

def check(label, h, ids, intended_key, expect):
    staged = {"galaxy": G, "history_id": h, "dataset_ids": ids}
    d, l = [], []
    _descends_from(Run(staged), f"$staged:{intended_key}", d)
    _lineage_intact(Run(staged), l)
    got = "fires" if d else "silent"
    print(f"{label:34} descendsFrom: {got:7} lineageIntact: {'fires' if l else 'silent':7} "
          f"{'OK' if got == expect else 'UNEXPECTED, wanted ' + expect}")
    for f in d: print("      ", f.detail)

GOLD, SILVER = "gold_medals.tabular", "silver_medals.tabular"
rows_g, rows_s = b"USA\t39\nCHN\t38\n", b"USA\t41\nCHN\t32\n"

h1 = G.new_history(f"c3 correct {TAG}")
g1, s1 = G.upload(h1, GOLD, rows_g), G.upload(h1, SILVER, rows_s)
wait(h1, 2); run_on(h1, g1); wait(h1, 3)
check("job on the intended input", h1, {GOLD: g1, SILVER: s1}, GOLD, "silent")

h2 = G.new_history(f"c3 distractor {TAG}")
g2, s2 = G.upload(h2, GOLD, rows_g), G.upload(h2, SILVER, rows_s)
wait(h2, 2); run_on(h2, s2); wait(h2, 3)
check("job on the distractor", h2, {GOLD: g2, SILVER: s2}, GOLD, "fires")

for h in (h1, h2):
    G.call(f"api/histories/{h}", "DELETE")
