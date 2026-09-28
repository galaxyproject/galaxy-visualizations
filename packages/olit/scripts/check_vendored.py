"""Vendored Orbit UI must stay byte-identical, so it can be re-synced by copy.

Upstream moves fast (87 commits to styles.css in six months); olit absorbs that
for free only while these files are untouched. An edit here turns every future
sync into a merge, so it fails loudly instead.

chat-panel.ts is the one documented exception: a 2-line import retarget.
"""

import hashlib
import json
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
VENDORED = ROOT / "src" / "orbit"
MANIFEST = VENDORED / "MANIFEST.json"

# Contracts owned elsewhere, vendored so the brain reads them from its own wheel inside Pyodide,
# where node_modules does not exist. Each maps to where the installed dependency publishes it,
# which is the source of truth the copy is checked against.
CONTRACTS = ROOT / "brain" / "olit" / "vendor"
CONTRACTS_MANIFEST = CONTRACTS / "MANIFEST.json"
CONTRACTS_TRACKED = {"galaxy-charts.inputs.json": "galaxy-charts/dist/galaxy-charts.inputs.json"}
NODE_MODULES = ROOT / "node_modules"

# The skills corpus is gitignored and fetched by scripts/install_skills.js, which stamps each
# file's git blob id. Recomputing them catches an edit made after vendoring.
SKILLS = ROOT / "brain" / "olit" / "registry" / "skills" / "galaxy-skills"
SKILLS_STAMP = SKILLS / "VENDORED.json"

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


def contracts(update: bool) -> int:
    """Each vendored contract against the dependency that publishes it."""
    upstream = json.loads(CONTRACTS_MANIFEST.read_text()).get("upstream", "upstream")
    drifted, uninstalled = [], []
    for name, published in CONTRACTS_TRACKED.items():
        source = NODE_MODULES / published
        copy = CONTRACTS / name
        if not source.exists():
            uninstalled.append(published)
        elif update:
            shutil.copyfile(source, copy)
        elif not copy.exists() or digest(copy) != digest(source):
            drifted.append(name)

    if uninstalled:
        print(f"{len(uninstalled)} contract(s) unchecked; not installed: {', '.join(uninstalled)}")
    if update:
        print(f"copied {len(CONTRACTS_TRACKED) - len(uninstalled)} contract(s) from the installed package")
        return 0
    if drifted:
        for name in drifted:
            print(f"  DIFFERS   brain/olit/vendor/{name}")
        print(
            f"\n{upstream} owns these; olit reads them and does not author them. The installed\n"
            "package is the source of truth, so re-copy from it with:\n"
            "  python3 scripts/check_vendored.py --update"
        )
        return 1
    print(f"{len(CONTRACTS_TRACKED) - len(uninstalled)} contract(s) match the installed package")
    return 0


def blob_id(path: pathlib.Path) -> str:
    """The id git gives a blob, which is what the vendor stamp records."""
    data = path.read_bytes()
    h = hashlib.sha1()
    h.update(b"blob %d\0" % len(data))
    h.update(data)
    return h.hexdigest()


def skills(argv: list[str]) -> int:
    """Compare the vendored skills corpus against the blob ids its install stamped."""
    if not SKILLS_STAMP.exists():
        print("skills corpus not vendored; run: node scripts/install_skills.js")
        return 0
    stamp = json.loads(SKILLS_STAMP.read_text())
    pinned = stamp.get("blobs") or {}
    if not pinned:
        print("skills corpus predates blob stamping; re-vendor with: node scripts/install_skills.js")
        return 0

    present = {str(p.relative_to(SKILLS)): p for p in SKILLS.rglob("*") if p.is_file() and p != SKILLS_STAMP}
    changed = sorted(r for r, want in pinned.items() if r in present and blob_id(present[r]) != want)
    missing = sorted(r for r in pinned if r not in present)
    extra = sorted(r for r in present if r not in pinned)
    if not (changed or missing or extra):
        print(f"{len(pinned)} vendored skill files unchanged at {stamp.get('sha', '?')[:8]}")
        return 0

    for r in changed:
        print(f"  MODIFIED  skills/galaxy-skills/{r}")
    for r in missing:
        print(f"  MISSING   skills/galaxy-skills/{r}")
    for r in extra:
        print(f"  EXTRA     skills/galaxy-skills/{r}")
    print(
        f"\n{stamp.get('repo', 'galaxy-skills')} owns this corpus and olit vendors it verbatim.\n"
        "A formatter or an editor reaching into it diverges from upstream and is undone by the\n"
        "next vendor. Restore it with:\n"
        "  node scripts/install_skills.js"
    )
    return 1


def main(argv: list[str]) -> int:
    manifest = json.loads(MANIFEST.read_text())
    now = current()

    if "--update" in argv:
        manifest["files"] = now
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"pinned {len(now)} vendored files")
        return contracts(update=True)

    pinned = manifest.get("files") or {}
    if not pinned:
        print("no pins recorded; run: python3 scripts/check_vendored.py --update")
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
            "Put olit-specific changes in olit-owned files (e.g. src/credentials.css).\n"
            "If this is a deliberate re-sync from upstream, re-pin with:\n"
            "  python3 scripts/check_vendored.py --update"
        )
        return 1

    if contracts(update=False):
        return 1

    print(f"{len(pinned)} vendored files unchanged")
    return skills(argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
