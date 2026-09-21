"""Vendored Orbit UI must stay byte-identical, so it can be re-synced by copy.

Upstream moves fast (87 commits to styles.css in six months); olite absorbs that
for free only while these files are untouched. An edit here turns every future
sync into a merge, so it fails loudly instead.

chat-panel.ts is the one documented exception: a 2-line import retarget.
"""

import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
VENDORED = ROOT / "src" / "orbit"
MANIFEST = VENDORED / "MANIFEST.json"

# Contracts owned elsewhere, vendored so the brain reads them offline.
CONTRACTS = ROOT / "brain" / "olite" / "vendor"
CONTRACTS_MANIFEST = CONTRACTS / "MANIFEST.json"
CONTRACTS_TRACKED = ["galaxy-charts.inputs.json"]

TRACKED = [
    "chat/chat-panel.ts",
    "chat/markdown.ts",
    "chat/block-spacing.ts",
    "chat/copy-button.ts",
    "update-banner.ts",
    "theme.ts",
    "styles.css",
    "shared/team-dispatch-contract.js",
    "shared/loom-shell-contract.js",
]


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def current() -> dict:
    out = {}
    for rel in TRACKED:
        p = VENDORED / rel
        if p.exists():
            out[rel] = digest(p)
    return out


def contracts_now() -> dict:
    return {r: digest(CONTRACTS / r) for r in CONTRACTS_TRACKED if (CONTRACTS / r).exists()}


def main(argv: list[str]) -> int:
    manifest = json.loads(MANIFEST.read_text())
    contracts = json.loads(CONTRACTS_MANIFEST.read_text())
    now = current()

    if "--update" in argv:
        manifest["files"] = now
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
        contracts["files"] = contracts_now()
        CONTRACTS_MANIFEST.write_text(json.dumps(contracts, indent=2) + "\n")
        print(f"pinned {len(now)} vendored files and {len(contracts['files'])} contracts")
        return 0

    pinned = manifest.get("files") or {}
    if not pinned:
        print("no pins recorded; run: python3 seams/check_vendored.py --update")
        return 1

    changed = [r for r in TRACKED if r in pinned and now.get(r) != pinned[r]]
    missing = [r for r in TRACKED if r not in now]
    if changed or missing:
        for r in changed:
            print(f"  MODIFIED  src/orbit/{r}")
        for r in missing:
            print(f"  MISSING   src/orbit/{r}")
        print(
            "\nVendored files are synced from loom by copy and must stay identical.\n"
            "Put olite-specific changes in olite-owned files (e.g. src/credentials.css).\n"
            "If this is a deliberate re-sync from upstream, re-pin with:\n"
            "  python3 seams/check_vendored.py --update"
        )
        return 1

    drifted = [r for r, h in (contracts.get("files") or {}).items() if contracts_now().get(r) != h]
    if drifted:
        for r in drifted:
            print(f"  MODIFIED  brain/olite/vendor/{r}")
        print(
            f"\n{contracts['upstream']} owns these; olite reads them and does not author them.\n"
            "Re-copy from a build of that repo and re-pin with:\n"
            "  python3 seams/check_vendored.py --update"
        )
        return 1

    print(f"{len(pinned)} vendored files and {len(contracts['files'])} contracts unchanged")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
