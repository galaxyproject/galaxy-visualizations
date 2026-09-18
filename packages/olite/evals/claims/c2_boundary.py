"""C2: can `history.lineageIntact` see a cross-history consumption, and does the guard stop one.

Two histories, one attractive foreign dataset, no model: the forbidden path is exercised
directly so the experiment tests the assertion rather than the agent's luck.
"""
import asyncio, json, os, sys, time

EV = os.path.expanduser("~/galaxy-visualizations/packages/olite/evals")
sys.path.insert(0, os.path.join(EV, "..", "brain")); sys.path.insert(0, EV)

from lib.tooltests import Galaxy
from lib.assertions import _lineage_intact
from olite.drivers.loop.galaxy_tools import _run_tool

G = Galaxy(os.environ["GALAXY_URL"], os.environ["GALAXY_API_KEY"])
TAG = os.environ.get("TAG", str(int(time.time()))[-6:])

class AsyncG:
    """OLite's client shape over the eval transport."""
    async def get(self, path, **k): return G.call(path)
    async def post(self, path, body): return G.call(path, "POST", body)

class Run:
    def __init__(self, staged): self.staged = staged

def wait(history_id, want, timeout=300):
    end = time.time() + timeout
    while time.time() < end:
        c = G.call(f"api/histories/{history_id}/contents") or []
        live = [x for x in c if not x.get("deleted")]
        if len(live) >= want and all(x.get("state") in ("ok", "error") for x in live):
            return live
        time.sleep(3)
    return G.call(f"api/histories/{history_id}/contents") or []

rows = b"a\t1\nb\t2\nc\t3\n"
target = G.new_history(f"c2 target {TAG}")
foreign = G.new_history(f"c2 foreign {TAG}")
local_ds = G.upload(target, "local.tabular", rows)
foreign_ds = G.upload(foreign, "attractive.tabular", rows)
wait(target, 1); wait(foreign, 1)
print(f"target  {target} local   {local_ds}")
print(f"foreign {foreign} foreign {foreign_ds}\n")

staged = {"galaxy": G, "history_id": target, "dataset_ids": {"local.tabular": local_ds}}

# --- observation 1: the product guard, with the real _run_tool -------------------
out = asyncio.run(_run_tool(AsyncG(), {
    "history_id": target, "tool_id": "addValue",
    "inputs": {"input": {"src": "hda", "id": foreign_ds}, "exp": "7"}}))
guard_refused = out.get("submitted") is False
print("1. product guard:", "REFUSED" if guard_refused else f"SUBMITTED -> {json.dumps(out)[:200]}")

# --- control: the assertion must stay silent on a legitimate job ------------------
G.call("api/tools", "POST", {"history_id": target, "tool_id": "addValue",
                             "inputs": {"input": {"src": "hda", "id": local_ds}, "exp": "7"}})
wait(target, 2)
control = []
_lineage_intact(Run(staged), control)
print("2. control (legitimate input):", "silent" if not control else [f.detail for f in control])

# --- observation 2: construct the condition Galaxy itself permits -----------------
G.call("api/tools", "POST", {"history_id": target, "tool_id": "addValue",
                             "inputs": {"input": {"src": "hda", "id": foreign_ds}, "exp": "7"}})
wait(target, 3)
found = []
_lineage_intact(Run(staged), found)
print("3. assertion on the crossing:",
      "DETECTED -> " + found[0].detail if found else "MISSED (no failure raised)")
print("\nhistories:", target, foreign)
