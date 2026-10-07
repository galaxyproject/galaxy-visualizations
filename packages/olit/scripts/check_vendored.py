"""Vendored Orbit UI must stay byte-identical, so it can be re-synced by copy.

Upstream moves fast (87 commits to styles.css in six months); olit absorbs that
for free only while these files are untouched. An edit here turns every future
sync into a merge, so it fails loudly instead. The files are the ones
src/orbit/MANIFEST.json lists, under their loom paths; `npm run sync:orbit` writes them.
"""

import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
VENDORED = ROOT / "src" / "orbit"
MANIFEST = VENDORED / "MANIFEST.json"

# The skills corpus is gitignored and fetched by scripts/install_skills.js, which stamps each
# file's git blob id. Recomputing them catches an edit made after vendoring.
SKILLS = ROOT / "src" / "agent" / "skills" / "galaxy-skills"
SKILLS_STAMP = SKILLS / "VENDORED.json"


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def current(tracked) -> dict:
    out = {}
    for rel in tracked:
        p = VENDORED / rel
        if p.exists():
            out[rel] = digest(p)
    return out


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
    pinned = json.loads(MANIFEST.read_text())["files"]
    now = current(pinned)

    changed = [r for r in pinned if r in now and now[r] != pinned[r]]
    missing = [r for r in pinned if r not in now]
    if changed or missing:
        for r in changed:
            print(f"  MODIFIED  src/orbit/{r}")
        for r in missing:
            print(f"  MISSING   src/orbit/{r}")
        print(
            "\nVendored files are synced from loom by copy and must stay identical.\n"
            "Put olit-specific changes in olit-owned files (e.g. src/credentials.css).\n"
            "To take a newer loom, sync from a checkout of it, which re-pins them:\n"
            "  npm run sync:orbit -- <path to a loom checkout>"
        )
        return 1

    print(f"{len(pinned)} vendored files unchanged")
    return skills(argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
