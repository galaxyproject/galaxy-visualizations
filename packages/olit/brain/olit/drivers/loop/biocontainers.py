"""Resolve a verified biocontainer image, the way upstream expects when mulled is absent.

galaxy-mcp resolves conda package sets through `galaxy.tool_util.deps.mulled.recommend`,
which cannot run here: Pyodide has no galaxy-tool-util. The udt-authoring skill names a
second route for exactly this case -- query the quay.io tag API -- and quay.io serves it
cross-origin, so the browser can. This takes that route and keeps galaxy-mcp's response
shape so an agent reads the same fields either way.

A mulled-v2 image for several packages is a hash over the package set, not something a tag
listing can reveal. That case answers `found: false` with a note, because a guessed
multi-package tag is the failure this tool exists to prevent.
"""

import json
import re
from urllib.parse import quote

from olit.substrate.http import http

REGISTRY = "quay.io/biocontainers"
TAGS_URL = "https://quay.io/api/v1/repository/biocontainers/{name}/tag/?onlyActiveTags=true&limit=100"


def parse_packages(packages):
    """Upstream's `name` or `name=version`, validated before anything reaches the network."""
    parsed = []
    for pkg in packages or []:
        name, _, version = str(pkg).partition("=")
        name = name.strip()
        if not name:
            raise ValueError(f"invalid package entry {pkg!r}: expected 'name' or 'name=version'")
        parsed.append((name, version.strip() or None))
    if not parsed:
        raise ValueError("packages must contain at least one conda package name")
    return parsed


def result(image=None, found=False, match_quality="not_found", notes=(), verified=None):
    """galaxy-mcp's response dict, so the agent reads the same fields from either server."""
    return {
        "image": image,
        "found": found,
        "match_quality": match_quality,
        "source": "quay.io tag listing",
        "notes": list(notes),
        "verified": verified,
    }


def pick_tag(tags, version):
    """The tag to use, and whether it matches the pinned version.

    A biocontainer tag is `<version>` or `<version>--<build>`; the build suffix is not
    derivable from the version, which is why it is read here rather than constructed.
    """
    named = [t for t in tags if isinstance(t, dict) and t.get("name")]
    if not named:
        return None, "not_found"
    if version:
        exact = [t for t in named if t["name"] == version or t["name"].startswith(f"{version}--")]
        if exact:
            return _newest(exact), "exact_version"
    return _newest(named), "name_only"


VERSION_PART = re.compile(r"^(\d+(?:\.\d+)*)")


def _version_key(tag):
    """Order by the version in the tag, then by build time within one version.

    Not by build time alone: quay rebuilds old tags, so `pandas` answered 0.23.4 from 2018
    because that tag had been touched more recently than 2.2.1.
    """
    match = VERSION_PART.match(tag.get("name") or "")
    numbers = tuple(int(n) for n in match.group(1).split(".")) if match else ()
    return (numbers, tag.get("start_ts") or 0)


def _newest(tags):
    """The highest version quay actually serves, and its most recent build."""
    return max(tags, key=_version_key)["name"]


async def recommend(packages):
    """One package resolves against the registry; several need mulled, which is not here."""
    parsed = parse_packages(packages)
    if len(parsed) > 1:
        names = ", ".join(name for name, _ in parsed)
        return result(
            notes=[
                f"A single image for several packages ({names}) is a mulled-v2 hash over the "
                "package set, which a tag listing cannot reveal. Ask Galaxy's own MCP server, "
                "or install the packages in one tool one at a time."
            ]
        )

    name, version = parsed[0]
    try:
        response = await http.request("GET", TAGS_URL.format(name=quote(name, safe="")))
    except Exception as e:
        # Quay answers 401 for a repository that does not exist, so a refusal and an unknown
        # package are the same reply; neither justifies inventing a tag.
        return result(notes=[f"quay.io did not answer for {name!r} ({e}); no image was resolved."])
    body = getattr(response, "text", response)
    tags = (json.loads(body) if isinstance(body, str) else body or {}).get("tags") or []
    tag, quality = pick_tag(tags, version)
    if tag is None:
        return result(notes=[f"quay.io lists no active tags for {name!r}."])

    image = f"{REGISTRY}/{name}:{tag}"
    notes = []
    if quality == "name_only":
        notes.append(
            f"No built tag matches version {version!r}; using the newest instead."
            if version
            else "No version was pinned; using the newest built tag."
        )
    return result(image=image, found=True, match_quality=quality, notes=notes, verified=True)
