#!/usr/bin/env python3
"""Wait for Galaxy work that is advancing on its own, as Olit's harness does between turns.

`paused` is not terminal -- loom says so too -- but it waits on a failed input or on the user,
so watching it until a deadline would freeze the arm for the whole window.

    GALAXY_URL=... GALAXY_API_KEY=... python3 settle-galaxy.py <history_id> [timeout_s]
"""

import json
import os
import sys
import time
import urllib.request

ADVANCING = ("new", "queued", "running", "upload", "setting_metadata")


def main():
    history = sys.argv[1]
    deadline = time.time() + float(sys.argv[2] if len(sys.argv) > 2 else 5400)
    base = (os.environ.get("GALAXY_URL") or "").rstrip("/")
    key = os.environ.get("GALAXY_API_KEY") or ""
    waited = False
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(
                    f"{base}/api/histories/{history}/contents?v=dev&keys=state&key={key}",
                    timeout=60) as r:
                rows = json.loads(r.read())
        except Exception as exc:  # one dropped poll must not end a long wait
            print(f"  settle: poll failed, retrying ({type(exc).__name__})", flush=True)
            time.sleep(10)
            continue
        live = [x for x in rows if isinstance(x, dict) and x.get("state") in ADVANCING]
        if not live:
            break
        waited = True
        print(f"  settle: {len(live)} advancing", flush=True)
        time.sleep(10)          # the shell watcher's own rate (src/invocations.ts)
    print("  settle: nothing advancing" if not waited else "  settle: work landed", flush=True)


if __name__ == "__main__":
    main()
