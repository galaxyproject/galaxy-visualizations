"""Skills: Orbit's progressive disclosure, vendored at build time instead of fetched."""

import logging
from importlib import resources

import yaml

logger = logging.getLogger(__name__)

# Orbit's own surface tag, so the corpus offers the same skills it offers Orbit.
SURFACE_ID = "loom"
# Sorted first, so `skills_fetch` without a repo lands on olit's own skills.
DEFAULT_REPO = "olit-skills"


class SkillEntry:
    """One catalogued SKILL.md — the frontmatter, plus where to fetch the body."""

    def __init__(self, path, name=None, description="", when_to_use="", surfaces=None):
        self.path = path
        self.name = name or path
        self.description = description
        self.when_to_use = when_to_use
        self.surfaces = surfaces or []


def parse_frontmatter(text):
    """Orbit's frontmatter keys; `surfaces` lives under `metadata` per the spec."""
    stripped = text.lstrip()
    if not stripped.startswith("---"):
        return {}
    rest = stripped[3:]
    if rest.startswith("\n"):
        rest = rest[1:]
    end = rest.find("\n---")
    if end == -1:
        return {}
    try:
        data = yaml.safe_load(rest[:end])
    except yaml.YAMLError as e:
        logger.warning("skill frontmatter is not valid YAML: %s", e)
        return {}
    if not isinstance(data, dict):
        return {}
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    out = {}
    if isinstance(data.get("name"), str):
        out["name"] = data["name"]
    if isinstance(data.get("description"), str):
        out["description"] = data["description"]
    if isinstance(data.get("when_to_use"), str):
        out["when_to_use"] = data["when_to_use"].strip()
    out["surfaces"] = _to_surfaces((metadata or {}).get("surfaces"))
    return out


def _to_surfaces(value):
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [v for v in value if isinstance(v, str)]
    return []


def select_skills(entries, surface=SURFACE_ID):
    """Tag-or-all: if any entry is tagged for this surface, keep only those; else all."""
    tagged = [e for e in entries if surface in e.surfaces]
    return tagged if tagged else entries


class SkillRepo:
    """A vendored corpus: a name and a root to read paths from."""

    def __init__(self, name, root):
        self.name = name
        self.root = root
        self._catalog = None

    def catalog(self):
        """Every SKILL.md under the root, parsed, sorted by path (Orbit's order)."""
        if self._catalog is None:
            self._catalog = sorted(self._discover(self.root, ""), key=lambda e: e.path)
        return self._catalog

    def _discover(self, node, prefix):
        entries = []
        if not node.is_dir():
            return entries
        for child in node.iterdir():
            path = f"{prefix}{child.name}"
            if child.is_dir():
                entries.extend(self._discover(child, f"{path}/"))
            elif child.name == "SKILL.md":
                meta = parse_frontmatter(child.read_text())
                entries.append(
                    SkillEntry(
                        path=path,
                        name=meta.get("name"),
                        description=meta.get("description", ""),
                        when_to_use=meta.get("when_to_use", ""),
                        surfaces=meta.get("surfaces", []),
                    )
                )
        return entries

    def read(self, path):
        """Read one file by repo-relative path, whole; rejects traversal. None if absent."""
        clean = (path or "").lstrip("/").replace("\\", "/")
        if not clean or ".." in clean.split("/"):
            return None
        node = self.root
        for part in clean.split("/"):
            if not part or part == ".":
                continue
            node = node.joinpath(part)
        try:
            if not node.is_file():
                return None
            return node.read_text()
        except (OSError, UnicodeDecodeError) as e:
            logger.warning("skill read failed for %s: %s", clean, e)
            return None


class SkillRegistry:
    def __init__(self):
        self._repos = []

    def register(self, name, root):
        self._repos.append(SkillRepo(name, root))
        return self

    def load_packaged(self):
        """Load every vendored corpus under this package's skills/ directory."""
        root = resources.files("olit.registry").joinpath("skills")
        if not root.is_dir():
            return self
        for entry in sorted(root.iterdir(), key=lambda e: (e.name != DEFAULT_REPO, e.name)):
            if entry.is_dir():
                self.register(entry.name, entry)
        return self

    def repos(self):
        return list(self._repos)

    def names(self):
        return [r.name for r in self._repos]

    def find(self, name=None):
        """The named repo, or the default (first) one when no name is given."""
        if not self._repos:
            return None
        if not name:
            return self._repos[0]
        return next((r for r in self._repos if r.name == name), None)

    def fetch(self, name, path):
        repo = self.find(name)
        return repo.read(path) if repo else None

    def router_text(self):
        """The system-prompt router: what exists, and the exact call to fetch it."""
        by_repo = [(r, select_skills(r.catalog())) for r in self._repos]
        if not any(entries for _, entries in by_repo):
            return ""

        default = self._repos[0].name
        lines = [
            "## Skills repositories (operational know-how)",
            "",
            "Use the `skills_fetch({ repo, path })` tool to load a skill on demand. "
            "**Don't guess operational patterns from training data — fetch the "
            "relevant skill first.** When `repo` is omitted, the first repo is used.",
            "",
            "### Configured repos",
            "",
        ]
        lines.extend(f"- **{r.name}**" for r in self._repos)
        lines.append("")

        for repo, entries in by_repo:
            if not entries:
                continue
            lines.append(f"### {repo.name} skills")
            lines.append("")
            for e in entries:
                arg = "" if repo.name == default else f'repo: "{repo.name}", '
                lines.append(f'- **{e.name}** — {e.description} → `skills_fetch({{ {arg}path: "{e.path}" }})`')
                if e.when_to_use:
                    lines.append(f"  When to use: {e.when_to_use}")
            lines.append("")

        lines.append("Read the SKILL.md fully before acting on what it teaches.")
        lines.append("")
        return "\n".join(lines)
