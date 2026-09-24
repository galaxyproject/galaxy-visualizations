#!/usr/bin/env python3
"""Stage the cryptic-exon-q1 history for the loom arm, and bind it in the scenario fixture.

The runner copies the scenario's cwd into the spawn and reads the history binding from the
notebook, so the starting state is written there before the run.

    GALAXY_URL=https://usegalaxy.eu GALAXY_API_KEY=$GALAXY_EU_KEY python3 stage-cryptic.py
"""

import datetime
import json
import os
import pathlib
import sys
import time
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
FIXTURE = HERE / "loom-scenarios/cryptic-exon-q1/cwd/notebook.md"
SCENARIO = json.loads((HERE.parent / "scenarios/cryptic-exon-q1/scenario.json").read_text())


def call(base, key, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{base}/{path}{'&' if '?' in path else '?'}key={key}", data=data,
        method="POST" if data else "GET",
        headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read() or b"null")


def main():
    base = (os.environ.get("GALAXY_URL") or "").rstrip("/")
    key = os.environ.get("GALAXY_API_KEY") or ""
    if not base or not key:
        sys.exit("GALAXY_URL and GALAXY_API_KEY are required")

    spec = SCENARIO["dataset"]
    history = call(base, key, "api/histories", {"name": spec.get("history", "cryptic exon q1")})
    element = {"src": "url", "url": spec["url"], "name": spec["name"], "ext": spec["datatype"]}
    out = call(base, key, "api/tools/fetch", {
        "history_id": history["id"],
        "targets": [{"destination": {"type": "hdas"}, "elements": [element]}]})
    dataset_id = out["outputs"][0]["id"]
    landed = {}
    for _ in range(120):
        try:
            landed = call(base, key, f"api/datasets/{dataset_id}")
        except Exception as exc:  # a dropped lookup must not lose a staged history
            print(f"  poll failed, retrying ({type(exc).__name__})", flush=True)
            time.sleep(10)
            continue
        if landed.get("state") in ("ok", "error"):
            break
        time.sleep(5)
    if landed.get("state") != "ok":
        sys.exit(f"{spec['name']} landed in state {landed.get('state')}")

    # A history is bound through a Galaxy Page.
    page = call(base, key, "api/pages", {
        "title": "Record", "slug": f"cryptic-exon-q1-{int(time.time())}",
        "content_format": "markdown", "content": "## Record\n",
        "history_id": history["id"]})

    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(
        "# Notebook\n\n"
        "```loom-galaxy-page\n"
        f"page_id: {page['id']}\n"
        f"page_slug: {page.get('slug', '')}\n"
        f"galaxy_server_url: {base}\n"
        f"history_id: {history['id']}\n"
        "last_synced_revision: \n"
        f"bound_at: {datetime.datetime.now(datetime.UTC).isoformat(timespec='seconds')}\n"
        "```\n")
    print(f"history {history['id']} | dataset {dataset_id} ({landed.get('extension')},"
          f" {landed.get('file_size')} bytes) | page {page['id']}")
    print(f"bound in {FIXTURE.relative_to(HERE)}")


if __name__ == "__main__":
    main()
